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
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("user_id", uuid.UUID{}).
			StorageKey("user_id"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.Time("start_date").
			Optional().
			SchemaType(map[string]string{
				"mysql": "date",
			}),
		field.Time("end_date").
			Optional().
			SchemaType(map[string]string{
				"mysql": "date",
			}),
		field.Bool("is_ongoing").
			Default(false),
		field.String("location").
			Optional().
			MaxLen(200),
		field.String("research_type").
			Optional().
			MaxLen(50),
		field.String("funding_source").
			Optional().
			MaxLen(200),
		field.Float("funding_amount").
			Optional(),
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

// Edges of the ResearchProject.
func (ResearchProject) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("research_projects").
			Field("user_id").
			Required().
			Unique(),
		edge.To("translations", ResearchProjectTranslation.Type),
		edge.To("details", ResearchProjectDetail.Type),
	}
}
