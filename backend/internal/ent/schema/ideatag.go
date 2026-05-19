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

// IdeaTag holds the schema definition for tags associated with ideas.
type IdeaTag struct {
	ent.Schema
}

// Annotations for the IdeaTag schema.
func (IdeaTag) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "idea_tags"},
	}
}

// Fields of the IdeaTag.
func (IdeaTag) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("name").
			MaxLen(100).
			NotEmpty(),
		field.String("slug").
			MaxLen(200).
			Unique().
			NotEmpty(),
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

// Edges of the IdeaTag.
func (IdeaTag) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("ideas", Idea.Type).
			Ref("tags"),
	}
}
