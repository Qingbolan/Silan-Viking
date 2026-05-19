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

// ProjectDetailTranslation holds the schema definition for the ProjectDetailTranslation entity.
type ProjectDetailTranslation struct {
	ent.Schema
}

// Annotations for the ProjectDetailTranslation schema.
func (ProjectDetailTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_detail_translations"},
	}
}

// Fields of the ProjectDetailTranslation.
func (ProjectDetailTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("project_detail_id").
			StorageKey("project_detail_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		// M0.5a §11.8: detailed_description/goals/challenges/solutions/
		// lessons_learned/future_enhancements (all Part body text) moved out
		// to item_part_translation. The table is kept as the per-language
		// anchor; dropping it is deferred (not an M0.5a irreversible action).
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Edges of the ProjectDetailTranslation.
func (ProjectDetailTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project_detail", ProjectDetail.Type).
			Ref("translations").
			Field("project_detail_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("project_detail_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
