package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
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
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("user_id", uuid.UUID{}).
			StorageKey("user_id"),

		// Basic information - matching Python model exactly
		field.Enum("type").
			Values("work", "education", "research", "publication", "project").
			Default("project"),
		field.String("title").
			MaxLen(200).
			NotEmpty(),
		field.Text("description").
			NotEmpty(),
		field.Time("date").
			SchemaType(map[string]string{
				"mysql": "date",
			}),

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
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the RecentUpdate.
func (RecentUpdate) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("recent_updates").
			Field("user_id").
			Required().
			Unique(),
		edge.To("translations", RecentUpdateTranslation.Type),
	}
}
