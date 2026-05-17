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
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("user_id", uuid.UUID{}).
			StorageKey("user_id"),
		field.String("full_name").
			MaxLen(200).
			NotEmpty(),
		field.String("title").
			MaxLen(200).
			NotEmpty(),
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
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the PersonalInfo.
func (PersonalInfo) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("personal_infos").
			Field("user_id").
			Required().
			Unique(),
		edge.To("translations", PersonalInfoTranslation.Type),
		edge.To("social_links", SocialLink.Type),
	}
}
