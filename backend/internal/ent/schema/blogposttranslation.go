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
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("blog_post_id").
			StorageKey("blog_post_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(500).
			Optional(),
		field.Text("excerpt").
			Optional(),
		// The blog body lives in `item_part_translation` (the prose Part of
		// the silan-viking content model); this column is legacy and stays
		// empty, so it must be optional.
		field.Text("content").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Optional().
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
