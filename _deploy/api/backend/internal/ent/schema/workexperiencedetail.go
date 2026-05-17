package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// WorkExperienceDetail holds the schema definition for the WorkExperienceDetail entity.
type WorkExperienceDetail struct {
	ent.Schema
}

// Fields of the WorkExperienceDetail.
func (WorkExperienceDetail) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("work_experience_id", uuid.UUID{}).
			StorageKey("work_experience_id"),
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

// Edges of the WorkExperienceDetail.
func (WorkExperienceDetail) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("work_experience", WorkExperience.Type).
			Ref("details").
			Field("work_experience_id").
			Required().
			Unique(),
		edge.To("translations", WorkExperienceDetailTranslation.Type),
	}
}
