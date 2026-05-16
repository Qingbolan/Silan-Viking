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

// EducationTranslation holds the schema definition for the EducationTranslation entity.
type EducationTranslation struct {
	ent.Schema
}

// Annotations for the EducationTranslation schema.
func (EducationTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "education_translations"},
	}
}

// Fields of the EducationTranslation.
func (EducationTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("education_id", uuid.UUID{}).
			StorageKey("education_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("institution").
			Optional().
			MaxLen(200),
		field.String("degree").
			Optional().
			MaxLen(200),
		field.String("field_of_study").
			Optional().
			MaxLen(200),
		field.String("location").
			Optional().
			MaxLen(200),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the EducationTranslation.
func (EducationTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("education", Education.Type).
			Ref("translations").
			Field("education_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("education_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
