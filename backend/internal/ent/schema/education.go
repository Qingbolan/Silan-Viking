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

// Education holds the schema definition for the Education entity.
type Education struct {
	ent.Schema
}

// Annotations for the Education schema.
func (Education) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "education"},
	}
}

// Fields of the Education.
func (Education) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			StorageKey("user_id"),
		field.String("institution").
			MaxLen(200).
			NotEmpty(),
		field.String("degree").
			MaxLen(200).
			NotEmpty(),
		field.String("field_of_study").
			Optional().
			MaxLen(200),
		field.String("start_date").Optional(),
		field.String("end_date").Optional(),
		field.Bool("is_current").
			Default(false),
		field.String("gpa").
			Optional().
			MaxLen(10),
		field.String("location").
			Optional().
			MaxLen(200),
		field.String("institution_website").
			Optional().
			MaxLen(500),
		field.String("institution_logo_url").
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

// Edges of the Education.
func (Education) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", EducationTranslation.Type),
		edge.To("details", EducationDetail.Type),
	}
}
