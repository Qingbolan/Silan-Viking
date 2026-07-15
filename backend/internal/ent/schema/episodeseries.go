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

// EpisodeSeries holds the schema definition for the episode container series
// (M0.5a, docs/silan-viking/11 §11.5.2, ruling #1). It is the strong-ownership
// container of episodes, distinct from blog_series (loose blog series).
type EpisodeSeries struct {
	ent.Schema
}

// Annotations for the EpisodeSeries schema.
func (EpisodeSeries) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "episode_series"},
	}
}

// Fields of the EpisodeSeries.
func (EpisodeSeries) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("slug").
			MaxLen(300).
			Unique().
			NotEmpty(),
		field.String("title").
			MaxLen(300).
			Optional(),
		field.Text("description").
			Optional().
			Nillable(),
		field.String("cover_url").
			MaxLen(1000).
			Optional().
			Nillable(),
		field.Enum("status").
			Values("ongoing", "completed", "archived").
			Default("ongoing"),
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

// Edges of the EpisodeSeries.
func (EpisodeSeries) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("episodes", Episode.Type),
		edge.To("translations", EpisodeSeriesTranslation.Type),
	}
}
