package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// RequestLog holds the schema definition for the API/access log table
// (M0.5a, docs/silan-viking/11 §11.10, ruling #7). It is formalized as a
// standalone ent table — not merged into content_interaction, since an access
// log and a content interaction are different things. It is a runtime table:
// written by the Go API on request arrival, never touched by promote.
//
// The id is an auto-increment integer (not a UUID) to stay compatible with
// the pre-existing request_logs table created in servicecontext.go.
type RequestLog struct {
	ent.Schema
}

// Annotations for the RequestLog schema.
func (RequestLog) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "request_logs"},
	}
}

// Fields of the RequestLog.
func (RequestLog) Fields() []ent.Field {
	return []ent.Field{
		field.Int("id"),
		field.String("method").
			Optional().
			MaxLen(16),
		field.String("path").
			Optional().
			MaxLen(1024),
		field.Int("status").
			Optional(),
		field.Int("duration_ms").
			Optional(),
		field.String("referrer").
			Optional().
			MaxLen(1024),
		field.String("user_agent").
			Optional().
			MaxLen(1024),
		field.String("ip").
			Optional().
			MaxLen(64),
		field.String("lang").
			Optional().
			MaxLen(8),
		field.String("country_code").
			Optional().
			MaxLen(2).
			Comment("ISO 3166-1 alpha-2 country supplied by the trusted edge proxy."),
		field.String("region_code").
			Optional().
			MaxLen(16).
			Comment("Most specific subdivision code available from the local IP geolocation database."),
		field.String("region_name").
			Optional().
			MaxLen(128).
			Comment("Most specific subdivision name available from the local IP geolocation database."),
		field.String("city").
			Optional().
			MaxLen(128),
		field.String("postal_code").
			Optional().
			MaxLen(32),
		field.String("place_name").
			Optional().
			MaxLen(128).
			Comment("Nearest offline GeoNames place for the IP-derived coordinates."),
		field.String("place_feature_code").
			Optional().
			MaxLen(16),
		field.Float("place_distance_km").
			Optional().
			Comment("Distance from IP-derived coordinates to the nearest offline place."),
		field.Float("latitude").
			Optional().
			Comment("IP-derived latitude from the local geolocation database."),
		field.Float("longitude").
			Optional().
			Comment("IP-derived longitude from the local geolocation database."),
		field.String("time_zone").
			Optional().
			MaxLen(64),
		field.Int("accuracy_radius").
			Optional().
			Comment("Estimated IP geolocation accuracy radius in kilometers."),
		field.Bool("is_bot").
			Default(false).
			Comment("Whether the User-Agent is a known search-engine / social crawler."),
		field.String("bot_name").
			Optional().
			MaxLen(64).
			Comment("Canonical crawler name when is_bot is true (e.g. Googlebot)."),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Indexes of the RequestLog.
func (RequestLog) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("created_at"),
		index.Fields("path"),
		index.Fields("is_bot"),
	}
}
