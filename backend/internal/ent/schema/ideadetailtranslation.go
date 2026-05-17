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

// IdeaDetailTranslation holds the schema definition for the IdeaDetailTranslation entity.
type IdeaDetailTranslation struct {
	ent.Schema
}

// Annotations for the IdeaDetailTranslation schema.
func (IdeaDetailTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "idea_detail_translations"},
	}
}

// Fields of the IdeaDetailTranslation.
func (IdeaDetailTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("idea_detail_id").
			StorageKey("idea_detail_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		// M0.5a §11.8: progress/results/references/required_resources
		// (Part body text) moved out to item_part_translation.
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the IdeaDetailTranslation.
func (IdeaDetailTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("idea_detail", IdeaDetail.Type).
			Ref("translations").
			Field("idea_detail_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("idea_detail_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
