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
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			Optional().
			StorageKey("user_id"),
		field.String("category_id").
			Optional().
			StorageKey("category_id"),
		field.String("series_id").
			Optional().
			StorageKey("series_id"),
		// ideas_id FK dropped (M0.5a §11.7): idea->blog evolution edges
		// now live in content_relation.
		field.String("title").
			MaxLen(500).
			Optional(),
		field.String("slug").
			MaxLen(300).
			Unique().
			NotEmpty(),
		field.Text("excerpt").
			Optional(),
		field.Text("content").
			Optional(),
		// M0.5a §11.7 / ledger #4 #6: add podcast/tutorial, drop episode
		// (episode is now its own table).
		field.Enum("content_type").
			Values("article", "podcast", "vlog", "tutorial").
			Default("article"),
		field.Enum("status").
			Values("draft", "published", "archived").
			Default("draft"),
		// M0.5a §11.7: status/visibility separation (10 §10.3).
		field.Enum("visibility").
			Values("private", "unlisted", "public").
			Default("private"),
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
		field.String("published_at").
			Optional(),
		field.Int("series_order").
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

// Edges of the BlogPost.
func (BlogPost) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("category", BlogCategory.Type).
			Ref("blog_posts").
			Field("category_id").
			Unique(),
		// No `series` edge: the silan-viking content model has no separate
		// `blog_series` table — a blog's series is just the `series_id` /
		// `series_order` fields on `blog_posts` itself (SCHEMA.md `blog`).
		// Only `episode` has a real container series (`episode_series`).
		// No `tags` edge: tags moved to the cross-type `content_tag` table
		// (M0.5b). The engine writes `tag` + `content_tag` rows directly,
		// and the Go side reads them via `internal/contenttag` with raw SQL
		// — no ent edge is needed and keeping one would resurrect the dead
		// `blog_tags` / `blog_post_tags` tables on every migrate.
		edge.To("translations", BlogPostTranslation.Type),
		// No `comments` edge: `comments` is a runtime table that soft-
		// references content by plain `entity_type` / `entity_id` fields. An
		// ent edge here would put a DB-level FK on `comments` pointing at
		// `blog_posts` — and promote rebuilds `blog_posts` with fresh ids
		// every content sync, dangling the FK and aborting the promote
		// transaction once any real comment exists. The comment handlers
		// query by `entity_type` + `entity_id` directly.
	}
}
