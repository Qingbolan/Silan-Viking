package analytics

import (
	"context"
	"net/url"
	"strings"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/recentupdate"
	"silan-backend/internal/svc"
)

// CrawlerHit is the server-edge representation of a static page request.
// Static HTML never passes through the API middleware, so nginx mirrors the
// request here after serving it. Only configured AI/search crawlers are
// accepted; ordinary browser requests remain owned by the page-view APIs.
type CrawlerHit struct {
	RequestURI string
	UserAgent  string
	Referrer   string
	IPAddress  string
}

func RecordCrawlerHit(ctx context.Context, svcCtx *svc.ServiceContext, hit CrawlerHit) error {
	if svcCtx.Traffic == nil {
		return nil
	}
	visitorKind, _ := svcCtx.Traffic.ClassifyVisitor(hit.UserAgent)
	if visitorKind != "ai_crawler" && visitorKind != "search_crawler" {
		return nil
	}

	entityType, entityID := resolveCrawlerTarget(ctx, svcCtx, hit.RequestURI)
	return RecordContentInteraction(ctx, svcCtx.DB, svcCtx.Traffic, svcCtx.CountryResolver, InteractionEvent{
		EntityType: entityType,
		EntityID:   entityID,
		Kind:       "view",
		IPAddress:  hit.IPAddress,
		UserAgent:  hit.UserAgent,
		Referrer:   hit.Referrer,
		LandingURL: hit.RequestURI,
	})
}

func resolveCrawlerTarget(ctx context.Context, svcCtx *svc.ServiceContext, requestURI string) (string, string) {
	parsed, err := url.ParseRequestURI(requestURI)
	if err != nil {
		return "resume", "homepage"
	}
	segments := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(segments) != 2 {
		return "resume", "homepage"
	}
	key, err := url.PathUnescape(segments[1])
	if err != nil || key == "" {
		return "resume", "homepage"
	}

	switch segments[0] {
	case "blog":
		row, queryErr := svcCtx.DB.BlogPost.Query().
			Where(blogpost.Or(blogpost.IDEQ(key), blogpost.SlugEQ(key))).
			Only(ctx)
		if queryErr == nil {
			return "blog", row.ID
		}
	case "projects":
		row, queryErr := svcCtx.DB.Project.Query().
			Where(project.Or(project.IDEQ(key), project.SlugEQ(key))).
			Only(ctx)
		if queryErr == nil {
			return "project", row.ID
		}
	case "recent-updates":
		row, queryErr := svcCtx.DB.RecentUpdate.Query().
			Where(recentupdate.Or(recentupdate.IDEQ(key), recentupdate.SlugEQ(key))).
			Only(ctx)
		if queryErr == nil {
			return "update", row.ID
		}
	}
	return "resume", "homepage"
}
