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

// ProjectDetail holds the schema definition for the ProjectDetail entity.
type ProjectDetail struct {
	ent.Schema
}

// Annotations for the ProjectDetail schema.
func (ProjectDetail) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_details"},
	}
}

// Fields of the ProjectDetail.
func (ProjectDetail) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("project_id", uuid.UUID{}).
			StorageKey("project_id"),
		field.Text("detailed_description").
			Optional(),
		field.Text("goals").
			Optional(),
		field.Text("challenges").
			Optional(),
		field.Text("solutions").
			Optional(),
		field.Text("lessons_learned").
			Optional(),
		field.Text("future_enhancements").
			Optional(),
		field.String("license").
			Optional().
			MaxLen(50),
		field.String("license_text").
			Optional(),
		field.String("version").
			Optional().
			MaxLen(20),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the ProjectDetail.
func (ProjectDetail) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("details").
			Field("project_id").
			Required().
			Unique(),
		edge.To("translations", ProjectDetailTranslation.Type),
	}
}
