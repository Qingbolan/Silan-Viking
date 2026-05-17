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

// BlogPost holds the schema definition for the BlogPost entity.
type BlogPost struct {
	ent.Schema
}

// Annotations for the BlogPost schema.
func (BlogPost) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_posts"},
	}
}

// Fields of the BlogPost.
func (BlogPost) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("user_id", uuid.UUID{}).
			StorageKey("user_id"),
		field.UUID("category_id", uuid.UUID{}).
			Optional().
			StorageKey("category_id"),
		field.UUID("series_id", uuid.UUID{}).
			Optional().
			StorageKey("series_id"),
		field.UUID("ideas_id", uuid.UUID{}).
			Optional().
			StorageKey("ideas_id"),
		field.String("title").
			MaxLen(500).
			NotEmpty(),
		field.String("slug").
			MaxLen(300).
			Unique().
			NotEmpty(),
		field.Text("excerpt").
			Optional(),
		field.Text("content").
			NotEmpty(),
		field.Enum("content_type").
			Values("article", "vlog", "episode").
			Default("article"),
		field.Enum("status").
			Values("draft", "published", "archived").
			Default("draft"),
		field.Bool("is_featured").
			Default(false),
		field.String("featured_image_url").
			Optional().
			MaxLen(500),
		field.Int("reading_time_minutes").
			Optional(),
		field.Int("view_count").
			Default(0),
		field.Int("like_count").
			Default(0),
		field.Int("comment_count").
			Default(0),
		field.Time("published_at").
			Optional(),
		field.Int("series_order").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the BlogPost.
func (BlogPost) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("blog_posts").
			Field("user_id").
			Required().
			Unique(),
		edge.From("category", BlogCategory.Type).
			Ref("blog_posts").
			Field("category_id").
			Unique(),
		edge.From("series", BlogSeries.Type).
			Ref("blog_posts").
			Field("series_id").
			Unique(),
		edge.From("ideas", Idea.Type).
			Ref("blog_posts").
			Field("ideas_id").
			Unique(),
		edge.To("tags", BlogTag.Type).
			Through("blog_post_tags", BlogPostTag.Type),
		edge.To("translations", BlogPostTranslation.Type),
		edge.To("comments", BlogComment.Type),
	}
}
