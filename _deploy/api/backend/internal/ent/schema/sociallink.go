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

// SocialLink holds the schema definition for the SocialLink entity.
type SocialLink struct {
	ent.Schema
}

// Annotations for the SocialLink schema.
func (SocialLink) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "social_links"},
	}
}

// Fields of the SocialLink.
func (SocialLink) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("personal_info_id", uuid.UUID{}).
			StorageKey("personal_info_id"),
		field.String("platform").
			MaxLen(50).
			NotEmpty(),
		field.String("url").
			MaxLen(500).
			NotEmpty(),
		field.String("display_name").
			Optional().
			MaxLen(100),
		field.Bool("is_active").
			Default(true),
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the SocialLink.
func (SocialLink) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("personal_info", PersonalInfo.Type).
			Ref("social_links").
			Field("personal_info_id").
			Required().
			Unique(),
	}
}
