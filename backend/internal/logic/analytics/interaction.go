package analytics

import (
	"context"
	"net/url"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/traffic"
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
	LandingURL      string
	SessionDuration int
	ScrollProgress  float64
}

// RecordContentInteraction inserts through the supplied ent client. Callers
// can pass tx.Client() so the interaction and its primary runtime record share
// one transaction instead of drifting after a partial failure.
func RecordContentInteraction(ctx context.Context, client *ent.Client, classifier *traffic.Classifier, resolver *traffic.CountryResolver, event InteractionEvent) error {
	visitorKind := "human"
	crawlerName := ""
	referrerKind := "direct"
	if classifier != nil {
		visitorKind, crawlerName = classifier.ClassifyVisitor(event.UserAgent)
		referrerKind = classifier.ClassifyReferrer(event.Referrer)
	}
	if referrerKind == "direct" && isAILandingAttribution(event.LandingURL) {
		referrerKind = "ai_chat"
	}
	builder := client.ContentInteraction.Create().
		SetEntityType(contentinteraction.EntityType(event.EntityType)).
		SetEntityID(event.EntityID).
		SetKind(contentinteraction.Kind(event.Kind)).
		SetVisitorKind(contentinteraction.VisitorKind(visitorKind)).
		SetReferrerKind(contentinteraction.ReferrerKind(referrerKind)).
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
	if event.Referrer != "" {
		builder.SetReferrer(event.Referrer)
	}
	if event.LandingURL != "" {
		builder.SetLandingURL(event.LandingURL)
	}
	if crawlerName != "" {
		builder.SetCrawlerName(crawlerName)
	}
	if visitorKind == "human" && resolver != nil {
		location := resolver.Resolve(event.IPAddress)
		if location.CountryCode != "" {
			builder.SetCountryCode(location.CountryCode)
		}
		if location.City != "" {
			builder.SetCity(location.City)
		}
		if location.Latitude != 0 || location.Longitude != 0 {
			builder.SetLatitude(location.Latitude).SetLongitude(location.Longitude)
		}
	}
	_, err := builder.Save(ctx)
	return err
}

func isAILandingAttribution(rawURL string) bool {
	if rawURL == "" {
		return false
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	values := parsed.Query()
	if strings.ToLower(values.Get("utm_medium")) != "ai" {
		return false
	}
	source := strings.ToLower(values.Get("utm_source"))
	for _, allowed := range []string{"chatgpt", "openai", "perplexity", "claude", "anthropic", "gemini", "google-ai", "copilot", "bing-ai"} {
		if source == allowed {
			return true
		}
	}
	return false
}
