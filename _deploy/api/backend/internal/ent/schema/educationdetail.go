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

// EducationDetail holds the schema definition for the EducationDetail entity.
type EducationDetail struct {
	ent.Schema
}

// Annotations for the EducationDetail schema.
func (EducationDetail) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "education_details"},
	}
}

// Fields of the EducationDetail.
func (EducationDetail) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("education_id", uuid.UUID{}).
			StorageKey("education_id"),
		field.Text("detail_text").
			NotEmpty(),
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the EducationDetail.
func (EducationDetail) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("education", Education.Type).
			Ref("details").
			Field("education_id").
			Required().
			Unique(),
		edge.To("translations", EducationDetailTranslation.Type),
	}
}
