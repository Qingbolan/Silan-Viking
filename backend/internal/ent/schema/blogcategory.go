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

// BlogCategory holds the schema definition for the BlogCategory entity.
type BlogCategory struct {
	ent.Schema
}

// Annotations for the BlogCategory schema.
func (BlogCategory) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_categories"},
	}
}

// Fields of the BlogCategory.
func (BlogCategory) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("name").
			MaxLen(100).
			NotEmpty(),
		field.String("slug").
			MaxLen(100).
			Unique().
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.String("color").
			Optional().
			MaxLen(7),
		field.Int("sort_order").
			Default(0),
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

// Edges of the BlogCategory.
func (BlogCategory) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", BlogCategoryTranslation.Type),
		// No reverse `blog_posts` edge: see BlogPost.Edges — the
		// `blog_posts.category_id` column holds a free-text frontmatter
		// label, not a `blog_categories.id`, so the relationship is not
		// representable as a real FK.
	}
}
