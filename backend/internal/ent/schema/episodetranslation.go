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

// EpisodeTranslation holds the per-language fields of an Episode
// (M0.5a, docs/silan-viking/11 §11.5.2).
type EpisodeTranslation struct {
	ent.Schema
}

// Annotations for the EpisodeTranslation schema.
func (EpisodeTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "episode_translations"},
	}
}

// Fields of the EpisodeTranslation.
func (EpisodeTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("episode_id").
			StorageKey("episode_id"),
		field.String("language_code").
			MaxLen(5).
			NotEmpty(),
		field.String("title").
			MaxLen(500).
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

// Indexes of the EpisodeTranslation.
func (EpisodeTranslation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("episode_id", "language_code").Unique(),
	}
}

// Edges of the EpisodeTranslation.
func (EpisodeTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("episode", Episode.Type).
			Ref("translations").
			Field("episode_id").
			Required().
			Unique(),
	}
}
