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

// BlogTag holds the schema definition for the BlogTag entity.
type BlogTag struct {
	ent.Schema
}

// Annotations for the BlogTag schema.
func (BlogTag) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_tags"},
	}
}

// Fields of the BlogTag.
func (BlogTag) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.String("name").
			MaxLen(50).
			NotEmpty(),
		field.String("slug").
			MaxLen(50).
			Unique().
			NotEmpty(),
		field.Int("usage_count").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the BlogTag.
func (BlogTag) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("blog_posts", BlogPost.Type).
			Ref("tags").
			Through("blog_post_tags", BlogPostTag.Type),
	}
}
