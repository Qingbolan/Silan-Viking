package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// RecentUpdate holds the schema definition for the RecentUpdate entity.
type RecentUpdate struct {
	ent.Schema
}

// Annotations for the RecentUpdate schema.
func (RecentUpdate) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "recent_updates"},
	}
}

// Fields of the RecentUpdate.
func (RecentUpdate) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			Optional().
			StorageKey("user_id"),

		// M0.5a §11.7.1: recent_updates is promoted to the content main table
		// of the `update` type (ruling #3). It needs a stable slug.
		field.String("slug").
			MaxLen(200).
			Unique().
			NotEmpty(),
		// Renamed from `type` (M0.5a §11.7.1): "which kind of thing this
		// update is about" — kept alongside update_type, not the same axis.
		field.Enum("subject_kind").
			Values("work", "education", "research", "publication", "project").
			Default("project").
			StorageKey("type"),
		// M0.5a §11.7.1 / 10 §10.4.6: the 8 update_type values — "what kind
		// of update this is".
		field.Enum("update_type").
			Values("milestone", "achievement", "progress", "release",
				"announcement", "insight", "learning", "reflection").
			Default("progress"),
		field.Enum("visibility").
			Values("private", "unlisted", "public").
			Default("private"),
		field.String("title").
			MaxLen(200).
			Optional(),
		field.Text("description").
			Optional(),
		field.String("date").Optional(),

		// Metadata
		field.JSON("tags", []string{}).
			Optional(),
		field.Enum("status").
			Values("active", "ongoing", "completed").
			Default("active"),
		field.Enum("priority").
			Values("high", "medium", "low").
			Default("medium"),
		field.String("external_id").
			Optional().
			MaxLen(100),

		// Multimedia fields - matching Python model exactly
		field.String("image_url").
			Optional().
			MaxLen(500),
		field.String("video_url").
			Optional().
			MaxLen(500),
		field.String("document_url").
			Optional().
			MaxLen(500),
		field.JSON("gallery", []string{}).
			Optional(),
		field.JSON("attachments", []map[string]interface{}{}).
			Optional(),
		field.JSON("media_metadata", map[string]interface{}{}).
			Optional(),

		// Social media and external links - matching Python model exactly
		field.String("demo_url").
			Optional().
			MaxLen(500),
		field.String("github_url").
			Optional().
			MaxLen(500),
		field.String("external_url").
			Optional().
			MaxLen(500),
		field.JSON("social_links", []map[string]interface{}{}).
			Optional(),

		// System fields
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
		Optional().
				Optional().
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
		Optional().
				Optional().
			UpdateDefault(time.Now),
	}
}

// Indexes of the RecentUpdate.
func (RecentUpdate) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("update_type"),
		index.Fields("visibility"),
	}
}

// Edges of the RecentUpdate.
func (RecentUpdate) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", RecentUpdateTranslation.Type),
	}
}
