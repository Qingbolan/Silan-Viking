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

// BlogPostTag holds the schema definition for the BlogPostTag entity.
type BlogPostTag struct {
	ent.Schema
}

// Annotations for the BlogPostTag schema.
func (BlogPostTag) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_post_tags"},
		field.ID("blog_post_id", "blog_tag_id"),
	}
}

// Fields of the BlogPostTag.
func (BlogPostTag) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("blog_post_id", uuid.UUID{}).
			StorageKey("blog_post_id"),
		field.UUID("blog_tag_id", uuid.UUID{}).
			StorageKey("blog_tag_id"),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the BlogPostTag.
func (BlogPostTag) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("blog_post", BlogPost.Type).
			Required().
			Unique().
			Field("blog_post_id"),
		edge.To("blog_tag", BlogTag.Type).
			Required().
			Unique().
			Field("blog_tag_id"),
	}
}
