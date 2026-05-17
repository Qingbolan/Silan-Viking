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

// BlogPostTranslation holds the schema definition for the BlogPostTranslation entity.
type BlogPostTranslation struct {
	ent.Schema
}

// Annotations for the BlogPostTranslation schema.
func (BlogPostTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_post_translations"},
	}
}

// Fields of the BlogPostTranslation.
func (BlogPostTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("blog_post_id", uuid.UUID{}).
			StorageKey("blog_post_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(500).
			NotEmpty(),
		field.Text("excerpt").
			Optional(),
		field.Text("content").
			NotEmpty(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the BlogPostTranslation.
func (BlogPostTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("blog_post", BlogPost.Type).
			Ref("translations").
			Field("blog_post_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("blog_post_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
