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

// EducationDetailTranslation holds the schema definition for the EducationDetailTranslation entity.
type EducationDetailTranslation struct {
	ent.Schema
}

// Annotations for the EducationDetailTranslation schema.
func (EducationDetailTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "education_detail_translations"},
	}
}

// Fields of the EducationDetailTranslation.
func (EducationDetailTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("education_detail_id", uuid.UUID{}).
			StorageKey("education_detail_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.Text("detail_text").
			NotEmpty(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the EducationDetailTranslation.
func (EducationDetailTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("education_detail", EducationDetail.Type).
			Ref("translations").
			Field("education_detail_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("education_detail_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
