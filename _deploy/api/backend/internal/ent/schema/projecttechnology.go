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

// ProjectTechnology holds the schema definition for the ProjectTechnology entity.
type ProjectTechnology struct {
	ent.Schema
}

// Annotations for the ProjectTechnology schema.
func (ProjectTechnology) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_technologies"},
	}
}

// Fields of the ProjectTechnology.
func (ProjectTechnology) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("project_id", uuid.UUID{}).
			StorageKey("project_id"),
		field.String("technology_name").
			MaxLen(100).
			NotEmpty(),
		field.String("technology_type").
			Optional().
			MaxLen(50),
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the ProjectTechnology.
func (ProjectTechnology) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("technologies").
			Field("project_id").
			Required().
			Unique(),
	}
}
