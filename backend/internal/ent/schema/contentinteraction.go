package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// ContentInteraction holds the schema definition for the unified interaction
// table (M0.5a, docs/silan-viking/11 §11.3). It merges project_views,
// project_likes and section-level analytics into one row-per-event table.
// This is a runtime table: written only on the server, never touched by
// promote (11 §11.11).
type ContentInteraction struct {
	ent.Schema
}

// Annotations for the ContentInteraction schema.
func (ContentInteraction) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "content_interaction"},
	}
}

// Fields of the ContentInteraction.
func (ContentInteraction) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "moment"),
		field.String("entity_id").
			StorageKey("entity_id"),
		field.String("section_anchor").
			Optional().
			Nillable(),
		// One row per event: a "view" or a "like".
		field.Enum("kind").
			Values("view", "like"),
		// Visitor identification (#15).
		field.String("user_identity_id").
			Optional().
			Nillable(),
		field.String("fingerprint").
			Optional().
			Nillable(),
		field.String("ip_address").
			Optional().
			Nillable(),
		field.String("user_agent").
			Optional().
			Nillable(),
		field.Enum("visitor_kind").
			Values("human", "search_crawler", "ai_crawler").
			Default("human"),
		// Final ruling (ledger #8): ai_chat is the repo-wide spelling.
		field.Enum("referrer_kind").
			Values("search", "social", "ai_chat", "direct", "internal").
			Default("direct"),
		field.String("referrer").
			Optional().
			Nillable().
			MaxLen(2048),
		field.String("landing_url").
			Optional().
			Nillable().
			MaxLen(2048),
		field.String("crawler_name").
			Optional().
			Nillable(),
		field.String("country_code").
			Optional().
			MaxLen(2),
		field.String("region_code").
			Optional().
			MaxLen(16),
		field.String("region_name").
			Optional().
			MaxLen(128),
		field.String("city").
			Optional().
			MaxLen(120),
		field.String("postal_code").
			Optional().
			MaxLen(32),
		field.String("place_name").
			Optional().
			MaxLen(128),
		field.String("place_feature_code").
			Optional().
			MaxLen(16),
		field.Float("place_distance_km").
			Optional(),
		field.Float("latitude").
			Optional(),
		field.Float("longitude").
			Optional(),
		field.String("time_zone").
			Optional().
			MaxLen(64),
		field.Int("accuracy_radius").
			Optional(),
		field.Int("session_duration").
			Default(0),
		field.Float("scroll_progress").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Indexes of the ContentInteraction.
func (ContentInteraction) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_type", "entity_id"),
		index.Fields("entity_type", "entity_id", "section_anchor"),
		index.Fields("entity_type", "entity_id", "kind"),
		index.Fields("fingerprint"),
		index.Fields("created_at"),
	}
}
