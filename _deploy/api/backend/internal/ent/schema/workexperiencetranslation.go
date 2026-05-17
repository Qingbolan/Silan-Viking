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

// WorkExperienceTranslation holds the schema definition for the WorkExperienceTranslation entity.
type WorkExperienceTranslation struct {
	ent.Schema
}

// Annotations for the WorkExperienceTranslation schema.
func (WorkExperienceTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "work_experience_translations"},
	}
}

// Fields of the WorkExperienceTranslation.
func (WorkExperienceTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("work_experience_id", uuid.UUID{}).
			StorageKey("work_experience_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("company").
			Optional().
			MaxLen(200),
		field.String("position").
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

// Edges of the WorkExperienceTranslation.
func (WorkExperienceTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("work_experience", WorkExperience.Type).
			Ref("translations").
			Field("work_experience_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("work_experience_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
