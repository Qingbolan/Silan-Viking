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

// PersonalInfo holds the schema definition for the PersonalInfo entity.
type PersonalInfo struct {
	ent.Schema
}

// Annotations for the PersonalInfo schema.
func (PersonalInfo) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "personal_info"},
	}
}

// Fields of the PersonalInfo.
func (PersonalInfo) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			Optional().
			StorageKey("user_id"),
		field.String("full_name").
			MaxLen(200).
			Optional(),
		field.String("title").
			MaxLen(200).
			Optional(),
		field.Text("current_status").
			Optional(),
		field.String("phone").
			Optional().
			MaxLen(20),
		field.String("email").
			Optional().
			MaxLen(255),
		field.String("location").
			Optional().
			MaxLen(200),
		field.String("website").
			Optional().
			MaxLen(500),
		field.String("avatar_url").
			Optional().
			MaxLen(500),
		field.Bool("is_primary").
			Default(false),
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

// Edges of the PersonalInfo.
func (PersonalInfo) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", PersonalInfoTranslation.Type),
		edge.To("social_links", SocialLink.Type),
	}
}
