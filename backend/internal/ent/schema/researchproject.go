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

// ResearchProject holds the schema definition for the ResearchProject entity.
type ResearchProject struct {
	ent.Schema
}

// Annotations for the ResearchProject schema.
func (ResearchProject) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "research_projects"},
	}
}

// Fields of the ResearchProject.
func (ResearchProject) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			Optional().
			StorageKey("user_id"),
		field.String("title").
			MaxLen(300).
			Optional(),
		field.String("start_date").Optional(),
		field.String("end_date").Optional(),
		field.Bool("is_ongoing").
			Default(false),
		field.String("location").
			Optional().
			MaxLen(200),
		field.String("research_type").
			Optional().
			MaxLen(50),
		field.String("image_url").
			Optional().
			MaxLen(500),
		field.String("funding_source").
			Optional().
			MaxLen(200),
		field.Float("funding_amount").
			Optional(),
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

// Edges of the ResearchProject.
func (ResearchProject) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", ResearchProjectTranslation.Type),
		edge.To("details", ResearchProjectDetail.Type),
	}
}
