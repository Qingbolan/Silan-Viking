package analytics

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"silan-backend/internal/svc"

	"github.com/google/uuid"
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

func RecordContentInteraction(ctx context.Context, svcCtx *svc.ServiceContext, event InteractionEvent) error {
	if svcCtx == nil || svcCtx.RawDB == nil {
		return nil
	}

	query := `INSERT INTO content_interaction (
		id, entity_type, entity_id, section_anchor, kind, user_identity_id, fingerprint,
		ip_address, user_agent, visitor_kind, referrer_kind, crawler_name,
		session_duration, scroll_progress, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	if svcCtx.Config.Database.Driver == "postgres" || svcCtx.Config.Database.Driver == "postgresql" {
		query = `INSERT INTO content_interaction (
			id, entity_type, entity_id, section_anchor, kind, user_identity_id, fingerprint,
			ip_address, user_agent, visitor_kind, referrer_kind, crawler_name,
			session_duration, scroll_progress, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`
	}

	visitorKind, crawlerName := classifyVisitor(event.UserAgent)
	_, err := svcCtx.RawDB.ExecContext(
		ctx,
		query,
		uuid.New().String(),
		event.EntityType,
		event.EntityID,
		nil,
		event.Kind,
		nullable(event.UserIdentityID),
		nullable(event.Fingerprint),
		nullable(event.IPAddress),
		nullable(event.UserAgent),
		visitorKind,
		classifyReferrer(event.Referrer),
		nullable(crawlerName),
		event.SessionDuration,
		event.ScrollProgress,
		time.Now(),
	)
	return err
}

func nullable(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
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
