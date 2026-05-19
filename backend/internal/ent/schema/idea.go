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
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			Optional().
			StorageKey("user_id"),
		field.String("title").
			MaxLen(300).
			Optional(),
		field.String("slug").
			MaxLen(200).
			Unique().
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.Text("abstract").
			Optional(),
		field.Enum("status").
			Values("draft", "hypothesis", "experimenting", "validating", "published", "concluded").
			Default("draft"),
		// M0.5a §11.7: is_public dropped, unified onto visibility (10 §10.3).
		field.Enum("visibility").
			Values("private", "unlisted", "public").
			Default("private"),
		field.Int("view_count").
			Default(0),
		field.Int("like_count").
			Default(0),
		field.String("category").
			MaxLen(100).
			Default("").
			Optional(),
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

// Edges of the Idea.
func (Idea) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", IdeaTranslation.Type),
		edge.To("details", IdeaDetail.Type).
			Unique(),
		// blog_posts edge dropped (M0.5a §11.7): idea->blog edges moved to
		// content_relation.
		// No `comments` edge: `comments` is a runtime table soft-referencing
		// content by `entity_type` / `entity_id` fields. An ent edge would
		// put a DB-level FK on `comments` -> `ideas`, which promote dangles
		// when it rebuilds `ideas` (see BlogPost.Edges for the rationale).
		// Many-to-many: idea <-> tags
		edge.To("tags", IdeaTag.Type).
			StorageKey(edge.Table("idea_tags_join")),
	}
}
