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

// EpisodeSeriesTranslation holds the per-language fields of an EpisodeSeries
// (M0.5a, docs/silan-viking/11 §11.5.2).
type EpisodeSeriesTranslation struct {
	ent.Schema
}

// Annotations for the EpisodeSeriesTranslation schema.
func (EpisodeSeriesTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "episode_series_translations"},
	}
}

// Fields of the EpisodeSeriesTranslation.
func (EpisodeSeriesTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("episode_series_id").
			StorageKey("episode_series_id"),
		field.String("language_code").
			MaxLen(5).
			NotEmpty(),
		field.String("title").
			MaxLen(300).
			Optional(),
		field.Text("description").
			Optional().
			Nillable(),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Indexes of the EpisodeSeriesTranslation.
func (EpisodeSeriesTranslation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("episode_series_id", "language_code").Unique(),
	}
}

// Edges of the EpisodeSeriesTranslation.
func (EpisodeSeriesTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("episode_series", EpisodeSeries.Type).
			Ref("translations").
			Field("episode_series_id").
			Required().
			Unique(),
	}
}
