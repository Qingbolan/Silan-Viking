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

// Idea holds the schema definition for the Idea entity.
type Idea struct {
	ent.Schema
}

// Annotations for the Idea schema.
func (Idea) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "ideas"},
	}
}

// Fields of the Idea.
func (Idea) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("user_id", uuid.UUID{}).
			StorageKey("user_id"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.String("slug").
			MaxLen(200).
			Unique().
			NotEmpty(),
		field.Text("abstract").
			Optional(),
		field.Text("motivation").
			Optional(),
		field.Text("methodology").
			Optional(),
		field.Text("expected_outcome").
			Optional(),
		field.Enum("status").
			Values("draft", "hypothesis", "experimenting", "validating", "published", "concluded").
			Default("draft"),
		field.Enum("priority").
			Values("low", "medium", "high", "urgent").
			Default("medium"),
		field.Int("estimated_duration_months").
			Optional(),
		field.Text("required_resources").
			Optional(),
		field.Bool("collaboration_needed").
			Default(false),
		field.Bool("funding_required").
			Default(false),
		field.Float("estimated_budget").
			Optional(),
		field.Bool("is_public").
			Default(false),
		field.Int("view_count").
			Default(0),
		field.Int("like_count").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the Idea.
func (Idea) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("ideas").
			Field("user_id").
			Required().
			Unique(),
		edge.To("translations", IdeaTranslation.Type),
		edge.To("blog_posts", BlogPost.Type),
	}
}
