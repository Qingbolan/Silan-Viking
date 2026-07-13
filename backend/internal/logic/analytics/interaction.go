package analytics

import (
	"context"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contentinteraction"
)

type InteractionEvent struct {
	EntityType      string
	EntityID        string
	Kind            string
	UserIdentityID  string
	Fingerprint     string
	IPAddress       string
	UserAgent       string
	Referrer        string
	SessionDuration int
	ScrollProgress  float64
}

// RecordContentInteraction inserts through the supplied ent client. Callers
// can pass tx.Client() so the interaction and its primary runtime record share
// one transaction instead of drifting after a partial failure.
func RecordContentInteraction(ctx context.Context, client *ent.Client, event InteractionEvent) error {
	visitorKind, crawlerName := classifyVisitor(event.UserAgent)
	builder := client.ContentInteraction.Create().
		SetEntityType(contentinteraction.EntityType(event.EntityType)).
		SetEntityID(event.EntityID).
		SetKind(contentinteraction.Kind(event.Kind)).
		SetVisitorKind(contentinteraction.VisitorKind(visitorKind)).
		SetReferrerKind(contentinteraction.ReferrerKind(classifyReferrer(event.Referrer))).
		SetSessionDuration(event.SessionDuration).
		SetScrollProgress(event.ScrollProgress)
	if event.UserIdentityID != "" {
		builder.SetUserIdentityID(event.UserIdentityID)
	}
	if event.Fingerprint != "" {
		builder.SetFingerprint(event.Fingerprint)
	}
	if event.IPAddress != "" {
		builder.SetIPAddress(event.IPAddress)
	}
	if event.UserAgent != "" {
		builder.SetUserAgent(event.UserAgent)
	}
	if crawlerName != "" {
		builder.SetCrawlerName(crawlerName)
	}
	_, err := builder.Save(ctx)
	return err
}

func classifyVisitor(userAgent string) (kind string, crawlerName string) {
	ua := strings.ToLower(userAgent)
	aiCrawlers := []string{"gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "anthropic-ai", "perplexitybot", "google-extended"}
	for _, token := range aiCrawlers {
		if strings.Contains(ua, token) {
			return "ai_crawler", token
		}
	}

	searchCrawlers := []string{"googlebot", "bingbot", "duckduckbot", "baiduspider", "yandexbot", "bot", "crawler", "spider"}
	for _, token := range searchCrawlers {
		if strings.Contains(ua, token) {
			return "search_crawler", token
		}
	}

	return "human", ""
}

func classifyReferrer(referrer string) string {
	ref := strings.ToLower(referrer)
	if ref == "" {
		return "direct"
	}

	internalDomains := []string{"silan.tech", "localhost", "127.0.0.1"}
	for _, token := range internalDomains {
		if strings.Contains(ref, token) {
			return "internal"
		}
	}

	aiSources := []string{"chatgpt", "perplexity", "gemini", "claude", "copilot"}
	for _, token := range aiSources {
		if strings.Contains(ref, token) {
			return "ai_chat"
		}
	}

	searchSources := []string{"google.", "bing.", "duckduckgo.", "baidu.", "yahoo.", "yandex."}
	for _, token := range searchSources {
		if strings.Contains(ref, token) {
			return "search"
		}
	}

	socialSources := []string{"x.com", "twitter.", "linkedin.", "facebook.", "instagram.", "reddit.", "weibo.", "zhihu."}
	for _, token := range socialSources {
		if strings.Contains(ref, token) {
			return "social"
		}
	}

	return "direct"
}
