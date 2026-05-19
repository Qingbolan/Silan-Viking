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

// WorkExperience holds the schema definition for the WorkExperience entity.
type WorkExperience struct {
	ent.Schema
}

// Annotations for the WorkExperience schema.
func (WorkExperience) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "work_experience"},
	}
}

// Fields of the WorkExperience.
func (WorkExperience) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			StorageKey("user_id"),
		field.String("company").
			MaxLen(200).
			NotEmpty(),
		field.String("position").
			MaxLen(200).
			NotEmpty(),
		field.String("start_date").Optional(),
		field.String("end_date").Optional(),
		field.Bool("is_current").
			Default(false),
		field.String("location").
			Optional().
			MaxLen(200),
		field.String("company_website").
			Optional().
			MaxLen(500),
		field.String("company_logo_url").
			Optional().
			MaxLen(500),
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			Optional().
			UpdateDefault(time.Now),
	}
}

// Edges of the WorkExperience.
func (WorkExperience) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", WorkExperienceTranslation.Type),
		edge.To("details", WorkExperienceDetail.Type),
	}
}
