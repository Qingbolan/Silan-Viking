package analytics

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/episode"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/traffic"
)

// CrawlerHit is the server-edge representation of a static page request.
// Static HTML never passes through the API middleware, so nginx mirrors the
// request here after serving it. All recognized bots enter the crawler access
// log; configured AI/search crawlers additionally enter the content ledger.
type CrawlerHit struct {
	RequestID  string
	Method     string
	RequestURI string
	UserAgent  string
	Referrer   string
	IPAddress  string
}

func RecordCrawlerHit(ctx context.Context, svcCtx *svc.ServiceContext, hit CrawlerHit) error {
	if svcCtx.Traffic == nil {
		return nil
	}
	classification := svcCtx.Traffic.ClassifyUserAgent(hit.UserAgent)
	if !classification.IsBot() {
		return nil
	}
	if svcCtx.CrawlerHits != nil && !svcCtx.CrawlerHits.Accept(hit.RequestID) {
		return nil
	}

	accessErr := recordCrawlerAccess(ctx, svcCtx, hit, classification)
	if _, isDiscoveryCrawler := classification.VisitorKind(); !isDiscoveryCrawler {
		return accessErr
	}
	entityType, entityID := resolveCrawlerTarget(ctx, svcCtx, hit.RequestURI)
	interactionErr := RecordContentInteraction(ctx, svcCtx.DB, svcCtx.Traffic, svcCtx.CountryResolver, InteractionEvent{
		EntityType: entityType,
		EntityID:   entityID,
		Kind:       "view",
		IPAddress:  hit.IPAddress,
		UserAgent:  boundedText(hit.UserAgent, 2048),
		Referrer:   boundedText(hit.Referrer, 2048),
		LandingURL: boundedText(hit.RequestURI, 2048),
	})
	// These are two append-only observation ledgers with different consumers.
	// Preserve either successful write and report all failures to the mirror
	// endpoint instead of rolling one observation back with the other.
	return errors.Join(accessErr, interactionErr)
}

func recordCrawlerAccess(
	ctx context.Context,
	svcCtx *svc.ServiceContext,
	hit CrawlerHit,
	classification traffic.UserAgentClassification,
) error {
	method := strings.ToUpper(strings.TrimSpace(hit.Method))
	if method == "" {
		method = "GET"
	}
	requestURI := strings.TrimSpace(hit.RequestURI)
	if requestURI == "" {
		requestURI = "/"
	}
	builder := svcCtx.DB.RequestLog.Create().
		SetMethod(boundedText(method, 16)).
		SetPath(boundedText(requestURI, 1024)).
		SetUserAgent(boundedText(hit.UserAgent, 1024)).
		SetIP(boundedText(hit.IPAddress, 64)).
		SetIsBot(true).
		SetBotName(boundedText(classification.CrawlerName, 64))
	if hit.Referrer != "" {
		builder.SetReferrer(boundedText(hit.Referrer, 1024))
	}
	_, err := builder.Save(ctx)
	return err
}

func boundedText(value string, maxRunes int) string {
	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes])
}

func resolveCrawlerTarget(ctx context.Context, svcCtx *svc.ServiceContext, requestURI string) (string, string) {
	parsed, err := url.ParseRequestURI(requestURI)
	if err != nil {
		return "resume", "homepage"
	}
	segments := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(segments) == 1 && segments[0] == "moments" {
		if key := parsed.Query().Get("id"); key != "" {
			return resolveMomentTarget(ctx, svcCtx, key)
		}
	}
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
	case "moments", "ideas":
		return resolveMomentTarget(ctx, svcCtx, key)
	case "episodes":
		row, queryErr := svcCtx.DB.Episode.Query().
			Where(episode.Or(episode.IDEQ(key), episode.SlugEQ(key))).
			Only(ctx)
		if queryErr == nil {
			return "episode", row.ID
		}
	}
	return "resume", "homepage"
}

func resolveMomentTarget(ctx context.Context, svcCtx *svc.ServiceContext, key string) (string, string) {
	row, err := svcCtx.DB.Moment.Query().
		Where(moment.Or(moment.IDEQ(key), moment.SlugEQ(key))).
		Only(ctx)
	if err == nil {
		return "moment", row.ID
	}
	return "resume", "homepage"
}
