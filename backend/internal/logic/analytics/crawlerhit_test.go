package analytics

import (
	"context"
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"silan-backend/internal/config"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/traffic"

	_ "github.com/mattn/go-sqlite3"
)

func crawlerTestService(t *testing.T) *svc.ServiceContext {
	t.Helper()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	classifier := traffic.NewClassifier(config.TrafficConfig{
		AIUserAgents:     []string{"claude-user"},
		SearchUserAgents: []string{"googlebot"},
		BotUserAgents: []config.BotSignatureConfig{
			{Token: "claude-user", Name: "Claude-User"},
			{Token: "googlebot", Name: "Googlebot"},
			{Token: "slackbot", Name: "Slackbot"},
		},
		GenericBotTokens: []string{"bot", "crawler", "spider"},
		OtherBotName:     "Other Bot",
	})
	return &svc.ServiceContext{
		DB:          client,
		Traffic:     classifier,
		CrawlerHits: traffic.NewObservationDeduplicator(time.Minute, 32),
	}
}

func TestRecordCrawlerHitWritesAccessAndDiscoveryLedgers(t *testing.T) {
	ctx := context.Background()
	service := crawlerTestService(t)

	err := RecordCrawlerHit(ctx, service, CrawlerHit{
		Method:     "GET",
		RequestURI: "/?utm_source=claude&utm_medium=ai&prompt=runtime+memory",
		UserAgent:  "Mozilla/5.0 Claude-User/1.0",
		Referrer:   "https://claude.ai/",
		IPAddress:  "203.0.113.8",
	})
	if err != nil {
		t.Fatalf("RecordCrawlerHit: %v", err)
	}

	logRow := service.DB.RequestLog.Query().OnlyX(ctx)
	if !logRow.IsBot || logRow.BotName != "Claude-User" {
		t.Fatalf("request log bot = (%v, %q), want (true, Claude-User)", logRow.IsBot, logRow.BotName)
	}
	if logRow.Path != "/?utm_source=claude&utm_medium=ai&prompt=runtime+memory" {
		t.Fatalf("request log path = %q, want original URI including query", logRow.Path)
	}

	interaction := service.DB.ContentInteraction.Query().OnlyX(ctx)
	if interaction.VisitorKind != contentinteraction.VisitorKindAiCrawler {
		t.Fatalf("visitor kind = %q, want ai_crawler", interaction.VisitorKind)
	}
	if interaction.CrawlerName == nil || *interaction.CrawlerName != "Claude-User" {
		t.Fatalf("crawler name = %v, want Claude-User", interaction.CrawlerName)
	}
	if interaction.LandingURL == nil || *interaction.LandingURL != logRow.Path {
		t.Fatalf("landing URL = %v, want original request URI", interaction.LandingURL)
	}
}

func TestRecordCrawlerHitKeepsOtherBotsOutOfSEOInteractions(t *testing.T) {
	ctx := context.Background()
	service := crawlerTestService(t)

	if err := RecordCrawlerHit(ctx, service, CrawlerHit{
		Method:     "HEAD",
		RequestURI: "/blog/example",
		UserAgent:  "Slackbot-LinkExpanding 1.0",
	}); err != nil {
		t.Fatalf("RecordCrawlerHit: %v", err)
	}

	logRow := service.DB.RequestLog.Query().OnlyX(ctx)
	if logRow.BotName != "Slackbot" || logRow.Method != "HEAD" {
		t.Fatalf("request log = (%q, %q), want (Slackbot, HEAD)", logRow.BotName, logRow.Method)
	}
	if count := service.DB.ContentInteraction.Query().CountX(ctx); count != 0 {
		t.Fatalf("content interactions = %d, want no GEO/SEO misclassification", count)
	}
}

func TestRecordCrawlerHitIgnoresHumanMirrorTraffic(t *testing.T) {
	ctx := context.Background()
	service := crawlerTestService(t)

	if err := RecordCrawlerHit(ctx, service, CrawlerHit{
		RequestURI: "/",
		UserAgent:  "Mozilla/5.0 Safari/605.1.15",
	}); err != nil {
		t.Fatalf("RecordCrawlerHit: %v", err)
	}
	if count := service.DB.RequestLog.Query().CountX(ctx); count != 0 {
		t.Fatalf("request logs = %d, want human mirror traffic discarded", count)
	}
	if count := service.DB.ContentInteraction.Query().CountX(ctx); count != 0 {
		t.Fatalf("content interactions = %d, want human mirror traffic discarded", count)
	}
}

func TestRecordCrawlerHitDeduplicatesNginxInternalRedirects(t *testing.T) {
	ctx := context.Background()
	service := crawlerTestService(t)
	hit := CrawlerHit{
		RequestID:  "nginx-request-one",
		Method:     "GET",
		RequestURI: "/blog/example?q=one",
		UserAgent:  "Mozilla/5.0 Claude-User/1.0",
	}

	if err := RecordCrawlerHit(ctx, service, hit); err != nil {
		t.Fatalf("first RecordCrawlerHit: %v", err)
	}
	if err := RecordCrawlerHit(ctx, service, hit); err != nil {
		t.Fatalf("duplicate RecordCrawlerHit: %v", err)
	}

	if count := service.DB.RequestLog.Query().CountX(ctx); count != 1 {
		t.Fatalf("request logs = %d, want one observation", count)
	}
	if count := service.DB.ContentInteraction.Query().CountX(ctx); count != 1 {
		t.Fatalf("content interactions = %d, want one observation", count)
	}
}

func TestResolveCrawlerTargetSupportsQueryMomentsAndEpisodes(t *testing.T) {
	ctx := context.Background()
	service := crawlerTestService(t)
	service.DB.Moment.Create().SetID("moment-one").SetSlug("memory-update").SaveX(ctx)
	service.DB.EpisodeSeries.Create().SetID("series-one").SetSlug("systems").SaveX(ctx)
	service.DB.Episode.Create().
		SetID("episode-one").
		SetSeriesID("series-one").
		SetSlug("crawler-observability").
		SetEpisodeNumber(1).
		SaveX(ctx)

	if kind, id := resolveCrawlerTarget(ctx, service, "/moments?id=memory-update"); kind != "moment" || id != "moment-one" {
		t.Fatalf("moment target = (%q, %q), want (moment, moment-one)", kind, id)
	}
	if kind, id := resolveCrawlerTarget(ctx, service, "/episodes/crawler-observability"); kind != "episode" || id != "episode-one" {
		t.Fatalf("episode target = (%q, %q), want (episode, episode-one)", kind, id)
	}
}
