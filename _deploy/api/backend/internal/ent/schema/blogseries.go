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

// BlogSeries holds the schema definition for the BlogSeries entity.
type BlogSeries struct {
	ent.Schema
}

// Annotations for the BlogSeries schema.
func (BlogSeries) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_series"},
	}
}

// Fields of the BlogSeries.
func (BlogSeries) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.String("slug").
			MaxLen(300).
			Unique().
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.String("thumbnail_url").
			Optional().
			MaxLen(500),
		field.String("status").
			MaxLen(20).
			Default("active"),
		field.Int("episode_count").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the BlogSeries.
func (BlogSeries) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("blog_posts", BlogPost.Type),
		edge.To("translations", BlogSeriesTranslation.Type),
	}
}
