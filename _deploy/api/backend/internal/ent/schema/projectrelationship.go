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

// ProjectRelationship holds the schema definition for the ProjectRelationship entity.
type ProjectRelationship struct {
	ent.Schema
}

// Annotations for the ProjectRelationship schema.
func (ProjectRelationship) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_relationships"},
	}
}

// Fields of the ProjectRelationship.
func (ProjectRelationship) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("source_project_id", uuid.UUID{}).
			StorageKey("source_project_id"),
		field.UUID("target_project_id", uuid.UUID{}).
			StorageKey("target_project_id"),
		field.String("relationship_type").
			MaxLen(50).
			NotEmpty(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the ProjectRelationship.
func (ProjectRelationship) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("source_project", Project.Type).
			Ref("source_relationships").
			Field("source_project_id").
			Required().
			Unique(),
		edge.From("target_project", Project.Type).
			Ref("target_relationships").
			Field("target_project_id").
			Required().
			Unique(),
	}
}
