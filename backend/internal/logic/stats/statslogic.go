// Package stats serves the runtime interaction statistics endpoints
// (docs/silan-viking/03 §3.2 #15). It aggregates the content_interaction and
// comments tables — the runtime data that only exists on the production
// server — into the four read-only stats views consumed by `silan stats` and
// the MCP stats tools.
package stats

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/requestlog"
	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// StatsLogic aggregates the runtime interaction tables.
type StatsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Snapshot returns all observed content statistics in one HTTP response.
// Per-item aggregation stays inside the backend so clients do not fan out
// four requests for every content item.
func (l *StatsLogic) Snapshot() (*types.StatsSnapshotResponse, error) {
	interactions, err := l.svcCtx.DB.ContentInteraction.Query().All(l.ctx)
	if err != nil {
		return nil, err
	}
	comments, err := l.svcCtx.DB.Comment.Query().All(l.ctx)
	if err != nil {
		return nil, err
	}
	type entity struct{ kind, id string }
	entities := map[entity]struct{}{}
	for _, row := range interactions {
		entities[entity{kind: row.EntityType.String(), id: row.EntityID}] = struct{}{}
	}
	for _, row := range comments {
		entities[entity{kind: row.EntityType.String(), id: row.EntityID}] = struct{}{}
	}
	keys := make([]entity, 0, len(entities))
	for key := range entities {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].kind == keys[j].kind {
			return keys[i].id < keys[j].id
		}
		return keys[i].kind < keys[j].kind
	})

	items := make([]types.StatsSnapshotItem, 0, len(keys))
	for _, key := range keys {
		req := &types.StatsRequest{EntityType: key.kind, EntityID: key.id}
		itemStats, statsErr := l.Stats(req)
		if statsErr != nil {
			return nil, statsErr
		}
		visitors, visitorsErr := l.Visitors(req)
		if visitorsErr != nil {
			return nil, visitorsErr
		}
		crawlers, crawlersErr := l.CrawlerBreakdown(req)
		if crawlersErr != nil {
			return nil, crawlersErr
		}
		sources, sourcesErr := l.SourceBreakdown(req)
		if sourcesErr != nil {
			return nil, sourcesErr
		}
		items = append(items, types.StatsSnapshotItem{
			Stats:    *itemStats,
			Visitors: visitors.Visitors,
			Crawlers: crawlers.Items,
			Sources:  sources.Items,
		})
	}
	countryLogs, err := l.svcCtx.DB.RequestLog.Query().
		Where(requestlog.IsBot(false), requestlog.CountryCodeNEQ("")).
		All(l.ctx)
	if err != nil {
		return nil, err
	}
	// One visitor can trigger several API requests for a page. Count each
	// observed network address once per country so endpoint fan-out does not
	// inflate the geographical ranking.
	type locationKey struct {
		country   string
		city      string
		latitude  float64
		longitude float64
	}
	locationVisitors := make(map[locationKey]map[string]struct{})
	for _, row := range countryLogs {
		if strings.HasPrefix(row.Path, "/api/v1/stats") {
			continue
		}
		key := locationKey{
			country:   row.CountryCode,
			city:      row.City,
			latitude:  row.Latitude,
			longitude: row.Longitude,
		}
		if locationVisitors[key] == nil {
			locationVisitors[key] = make(map[string]struct{})
		}
		locationVisitors[key][row.IP] = struct{}{}
	}
	countries := make([]types.CountryRow, 0, len(locationVisitors))
	for location, visitors := range locationVisitors {
		countries = append(countries, types.CountryRow{
			CountryCode: location.country,
			City:        location.city,
			Latitude:    location.latitude,
			Longitude:   location.longitude,
			Count:       len(visitors),
		})
	}
	sort.Slice(countries, func(i, j int) bool {
		if countries[i].Count == countries[j].Count {
			if countries[i].CountryCode == countries[j].CountryCode {
				return countries[i].City < countries[j].City
			}
			return countries[i].CountryCode < countries[j].CountryCode
		}
		return countries[i].Count > countries[j].Count
	})
	return &types.StatsSnapshotResponse{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Items:       items,
		Countries:   countries,
	}, nil
}

// NewStatsLogic builds a StatsLogic for one request.
func NewStatsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *StatsLogic {
	return &StatsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// entityID returns the request's entity_id as a string id, validating that
// it is non-empty. Ids are prefixed-ULID strings written by the Rust engine.
func entityID(req *types.StatsRequest) (string, error) {
	if req.EntityID == "" {
		return "", fmt.Errorf("entity_id is required")
	}
	return req.EntityID, nil
}

func entityType(req *types.StatsRequest) (string, error) {
	if req.EntityType == "" {
		return "", fmt.Errorf("entity_type is required")
	}
	return req.EntityType, nil
}

// Stats returns the aggregate view/like/comment counts of one content item.
func (l *StatsLogic) Stats(req *types.StatsRequest) (*types.StatsResponse, error) {
	kind, err := entityType(req)
	if err != nil {
		return nil, err
	}
	id, err := entityID(req)
	if err != nil {
		return nil, err
	}
	var views, likes int
	switch kind {
	case "project":
		counts, countErr := engagement.ProjectCount(l.ctx, l.svcCtx.DB, id)
		if countErr != nil {
			return nil, countErr
		}
		views, likes = counts.Views, counts.Likes
	case "blog":
		counts, countErr := engagement.BlogCount(l.ctx, l.svcCtx.DB, id)
		if countErr != nil {
			return nil, countErr
		}
		views, likes = counts.Views, counts.Likes
	default:
		entityType := contentinteraction.EntityType(kind)
		views, err = l.svcCtx.DB.ContentInteraction.Query().
			Where(
				contentinteraction.EntityTypeEQ(entityType),
				contentinteraction.EntityIDEQ(id),
				contentinteraction.KindEQ(contentinteraction.KindView),
			).Count(l.ctx)
		if err != nil {
			return nil, err
		}
		likes, err = l.svcCtx.DB.ContentInteraction.Query().
			Where(
				contentinteraction.EntityTypeEQ(entityType),
				contentinteraction.EntityIDEQ(id),
				contentinteraction.KindEQ(contentinteraction.KindLike),
			).Count(l.ctx)
		if err != nil {
			return nil, err
		}
	}
	comments, err := l.svcCtx.DB.Comment.Query().
		Where(
			comment.EntityTypeEQ(comment.EntityType(req.EntityType)),
			comment.EntityIDEQ(id),
		).Count(l.ctx)
	if err != nil {
		return nil, err
	}

	return &types.StatsResponse{
		EntityType: req.EntityType,
		EntityID:   req.EntityID,
		Views:      views,
		Likes:      likes,
		Comments:   comments,
	}, nil
}

// maskIP keeps only the network portion of an IP so the MCP / CLI side never
// receives a raw address (docs/silan-viking/08 §8.4).
func maskIP(ip string) string {
	if ip == "" {
		return ""
	}
	// Mask the last octet/hextet.
	for i := len(ip) - 1; i >= 0; i-- {
		if ip[i] == '.' || ip[i] == ':' {
			return ip[:i+1] + "x"
		}
	}
	return "x"
}

// Visitors lists the de-identified visitors of a content item.
func (l *StatsLogic) Visitors(req *types.StatsRequest) (*types.VisitorsResponse, error) {
	kind, err := entityType(req)
	if err != nil {
		return nil, err
	}
	id, err := entityID(req)
	if err != nil {
		return nil, err
	}
	rows, err := l.svcCtx.DB.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityType(kind)),
			contentinteraction.EntityIDEQ(id),
		).
		Order(contentinteraction.ByCreatedAt()).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	visitors := make([]types.VisitorRow, 0, len(rows))
	for _, row := range rows {
		ip := ""
		if row.IPAddress != nil {
			ip = *row.IPAddress
		}
		fp := ""
		if row.Fingerprint != nil {
			fp = *row.Fingerprint
		}
		visitors = append(visitors, types.VisitorRow{
			Fingerprint:  fp,
			IPMasked:     maskIP(ip),
			VisitorKind:  row.VisitorKind.String(),
			ReferrerKind: row.ReferrerKind.String(),
			LastSeenAt:   row.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return &types.VisitorsResponse{
		EntityType: req.EntityType,
		EntityID:   req.EntityID,
		Visitors:   visitors,
	}, nil
}

// CrawlerBreakdown aggregates interactions by visitor kind. An empty
// entity_id aggregates across all content.
func (l *StatsLogic) CrawlerBreakdown(req *types.StatsRequest) (*types.CrawlerBreakdownResponse, error) {
	query := l.svcCtx.DB.ContentInteraction.Query()
	if req.EntityID != "" {
		kind, err := entityType(req)
		if err != nil {
			return nil, err
		}
		id, err := entityID(req)
		if err != nil {
			return nil, err
		}
		query = query.Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityType(kind)),
			contentinteraction.EntityIDEQ(id),
		)
	}
	rows, err := query.All(l.ctx)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, row := range rows {
		counts[row.VisitorKind.String()]++
	}
	items := make([]types.CrawlerRow, 0, len(counts))
	for _, kind := range []string{"human", "search_crawler", "ai_crawler"} {
		if c, ok := counts[kind]; ok {
			items = append(items, types.CrawlerRow{VisitorKind: kind, Count: c})
		}
	}
	return &types.CrawlerBreakdownResponse{Items: items}, nil
}

// SourceBreakdown aggregates interactions by referrer source.
func (l *StatsLogic) SourceBreakdown(req *types.StatsRequest) (*types.SourceBreakdownResponse, error) {
	query := l.svcCtx.DB.ContentInteraction.Query()
	if req.EntityID != "" {
		kind, err := entityType(req)
		if err != nil {
			return nil, err
		}
		id, err := entityID(req)
		if err != nil {
			return nil, err
		}
		query = query.Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityType(kind)),
			contentinteraction.EntityIDEQ(id),
		)
	}
	rows, err := query.All(l.ctx)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, row := range rows {
		counts[row.ReferrerKind.String()]++
	}
	items := make([]types.SourceRow, 0, len(counts))
	for _, src := range []string{"search", "social", "ai_chat", "direct", "internal"} {
		if c, ok := counts[src]; ok {
			items = append(items, types.SourceRow{Source: src, Count: c})
		}
	}
	return &types.SourceBreakdownResponse{Items: items}, nil
}
