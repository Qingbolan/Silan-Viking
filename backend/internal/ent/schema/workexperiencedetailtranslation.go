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

// WorkExperienceDetailTranslation holds the schema definition for the WorkExperienceDetailTranslation entity.
type WorkExperienceDetailTranslation struct {
	ent.Schema
}

// Annotations for the WorkExperienceDetailTranslation schema.
func (WorkExperienceDetailTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "work_experience_detail_translations"},
	}
}

// Fields of the WorkExperienceDetailTranslation.
func (WorkExperienceDetailTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("work_experience_detail_id").
			StorageKey("work_experience_detail_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.Text("detail_text").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Edges of the WorkExperienceDetailTranslation.
func (WorkExperienceDetailTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("work_experience_detail", WorkExperienceDetail.Type).
			Ref("translations").
			Field("work_experience_detail_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("work_experience_detail_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
