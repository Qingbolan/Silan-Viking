package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// ResearchProjectDetail holds the schema definition for the ResearchProjectDetail entity.
type ResearchProjectDetail struct {
	ent.Schema
}

// Fields of the ResearchProjectDetail.
func (ResearchProjectDetail) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("research_project_id", uuid.UUID{}).
			StorageKey("research_project_id"),
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

// Edges of the ResearchProjectDetail.
func (ResearchProjectDetail) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("research_project", ResearchProject.Type).
			Ref("details").
			Field("research_project_id").
			Required().
			Unique(),
		edge.To("translations", ResearchProjectDetailTranslation.Type),
	}
}
