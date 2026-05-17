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

// ResearchProjectTranslation holds the schema definition for the ResearchProjectTranslation entity.
type ResearchProjectTranslation struct {
	ent.Schema
}

// Annotations for the ResearchProjectTranslation schema.
func (ResearchProjectTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "research_project_translations"},
	}
}

// Fields of the ResearchProjectTranslation.
func (ResearchProjectTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("research_project_id", uuid.UUID{}).
			StorageKey("research_project_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.String("location").
			Optional().
			MaxLen(200),
		field.String("research_type").
			Optional().
			MaxLen(50),
		field.String("funding_source").
			Optional().
			MaxLen(200),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the ResearchProjectTranslation.
func (ResearchProjectTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("research_project", ResearchProject.Type).
			Ref("translations").
			Field("research_project_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("research_project_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
