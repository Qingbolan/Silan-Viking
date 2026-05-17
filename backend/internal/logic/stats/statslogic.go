// Package stats serves the runtime interaction statistics endpoints
// (docs/silan-viking/03 §3.2 #15). It aggregates the content_interaction and
// comments tables — the runtime data that only exists on the production
// server — into the four read-only stats views consumed by `silan stats` and
// the MCP stats tools.
package stats

import (
	"context"
	"fmt"

	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

// StatsLogic aggregates the runtime interaction tables.
type StatsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// NewStatsLogic builds a StatsLogic for one request.
func NewStatsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *StatsLogic {
	return &StatsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// entityID parses the request's entity_id into a UUID.
func entityID(req *types.StatsRequest) (uuid.UUID, error) {
	id, err := uuid.Parse(req.EntityID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid entity_id %q: %w", req.EntityID, err)
	}
	return id, nil
}

// Stats returns the aggregate view/like/comment counts of one content item.
func (l *StatsLogic) Stats(req *types.StatsRequest) (*types.StatsResponse, error) {
	id, err := entityID(req)
	if err != nil {
		return nil, err
	}
	entityType := contentinteraction.EntityType(req.EntityType)

	views, err := l.svcCtx.DB.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(entityType),
			contentinteraction.EntityIDEQ(id),
			contentinteraction.KindEQ(contentinteraction.KindView),
		).Count(l.ctx)
	if err != nil {
		return nil, err
	}
	likes, err := l.svcCtx.DB.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(entityType),
			contentinteraction.EntityIDEQ(id),
			contentinteraction.KindEQ(contentinteraction.KindLike),
		).Count(l.ctx)
	if err != nil {
		return nil, err
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
	id, err := entityID(req)
	if err != nil {
		return nil, err
	}
	rows, err := l.svcCtx.DB.ContentInteraction.Query().
		Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityType(req.EntityType)),
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
		id, err := entityID(req)
		if err != nil {
			return nil, err
		}
		query = query.Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityType(req.EntityType)),
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
		id, err := entityID(req)
		if err != nil {
			return nil, err
		}
		query = query.Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityType(req.EntityType)),
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
