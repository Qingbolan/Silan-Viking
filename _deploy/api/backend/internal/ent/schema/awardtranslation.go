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

// AwardTranslation holds the schema definition for the AwardTranslation entity.
type AwardTranslation struct {
	ent.Schema
}

// Annotations for the AwardTranslation schema.
func (AwardTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "award_translations"},
	}
}

// Fields of the AwardTranslation.
func (AwardTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("award_id", uuid.UUID{}).
			StorageKey("award_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.String("awarding_organization").
			MaxLen(200).
			NotEmpty(),
		field.String("award_type").
			Optional().
			MaxLen(50),
		field.Text("description").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the AwardTranslation.
func (AwardTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("award", Award.Type).
			Ref("translations").
			Field("award_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("award_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
