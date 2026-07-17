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

// MomentTranslation holds the schema definition for the MomentTranslation entity.
type MomentTranslation struct {
	ent.Schema
}

// Annotations for the MomentTranslation schema.
func (MomentTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "moment_translations"},
	}
}

// Fields of the MomentTranslation.
func (MomentTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("moment_id").
			StorageKey("moment_id"),
		field.String("language_code").
			MaxLen(5).
			NotEmpty(),

		// Translatable fields - matching Python model exactly
		field.String("title").
			MaxLen(200).
			Optional(),
		field.Text("description").
			Optional(),

		// System fields
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Edges of the MomentTranslation.
func (MomentTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("moment", Moment.Type).
			Ref("translations").
			Field("moment_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("moment_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
