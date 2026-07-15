package analytics

import (
	"context"

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
	SessionDuration int
	ScrollProgress  float64
}

// RecordContentInteraction inserts through the supplied ent client. Callers
// can pass tx.Client() so the interaction and its primary runtime record share
// one transaction instead of drifting after a partial failure.
func RecordContentInteraction(ctx context.Context, client *ent.Client, classifier *traffic.Classifier, event InteractionEvent) error {
	visitorKind := "human"
	crawlerName := ""
	referrerKind := "direct"
	if classifier != nil {
		visitorKind, crawlerName = classifier.ClassifyVisitor(event.UserAgent)
		referrerKind = classifier.ClassifyReferrer(event.Referrer)
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
	if crawlerName != "" {
		builder.SetCrawlerName(crawlerName)
	}
	_, err := builder.Save(ctx)
	return err
}
