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

// IdeaTranslation holds the schema definition for the IdeaTranslation entity.
type IdeaTranslation struct {
	ent.Schema
}

// Annotations for the IdeaTranslation schema.
func (IdeaTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "idea_translations"},
	}
}

// Fields of the IdeaTranslation.
func (IdeaTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("idea_id", uuid.UUID{}).
			StorageKey("idea_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.Text("abstract").
			Optional(),
		field.Text("motivation").
			Optional(),
		field.Text("methodology").
			Optional(),
		field.Text("expected_outcome").
			Optional(),
		field.Text("required_resources").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the IdeaTranslation.
func (IdeaTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("idea", Idea.Type).
			Ref("translations").
			Field("idea_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("idea_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
