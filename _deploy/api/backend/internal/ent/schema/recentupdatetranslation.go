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

// RecentUpdateTranslation holds the schema definition for the RecentUpdateTranslation entity.
type RecentUpdateTranslation struct {
	ent.Schema
}

// Annotations for the RecentUpdateTranslation schema.
func (RecentUpdateTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "recent_update_translations"},
	}
}

// Fields of the RecentUpdateTranslation.
func (RecentUpdateTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("recent_update_id", uuid.UUID{}).
			StorageKey("recent_update_id"),
		field.String("language_code").
			MaxLen(5).
			NotEmpty(),

		// Translatable fields - matching Python model exactly
		field.String("title").
			MaxLen(200).
			NotEmpty(),
		field.Text("description").
			NotEmpty(),

		// System fields
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the RecentUpdateTranslation.
func (RecentUpdateTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("recent_update", RecentUpdate.Type).
			Ref("translations").
			Field("recent_update_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("recent_update_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
