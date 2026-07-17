package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// Episode holds the schema definition for a single episode Item
// (M0.5a, docs/silan-viking/11 §11.5.2, ruling #1). Episode is an independent
// content table, not a row of blog_posts: invariant #5 ("episode never appears
// in the blog list") is guaranteed structurally.
type Episode struct {
	ent.Schema
}

// Annotations for the Episode schema.
func (Episode) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "episodes"},
	}
}

// Fields of the Episode.
func (Episode) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		// Strong ownership: every episode belongs to a container series.
		field.String("series_id").
			StorageKey("series_id"),
		field.String("slug").
			MaxLen(300).
			Unique().
			NotEmpty(),
		field.String("title").
			MaxLen(500).
			Optional(),
		field.Int("episode_number"),
		field.Enum("status").
			Values("draft", "published", "archived").
			Default("draft"),
		field.Enum("visibility").
			Values("private", "unlisted", "public").
			Default("private"),
		field.String("published_at").
			Optional().
			Nillable(),
		field.Int("duration_minutes").
			Optional().
			Nillable(),
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

// Indexes of the Episode.
func (Episode) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("series_id"),
		index.Fields("series_id", "episode_number").Unique(),
	}
}

// Edges of the Episode.
func (Episode) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("series", EpisodeSeries.Type).
			Ref("episodes").
			Field("series_id").
			Required().
			Unique(),
		edge.To("translations", EpisodeTranslation.Type),
	}
}
