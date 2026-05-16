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

// ProjectTranslation holds the schema definition for the ProjectTranslation entity.
type ProjectTranslation struct {
	ent.Schema
}

// Annotations for the ProjectTranslation schema.
func (ProjectTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_translations"},
	}
}

// Fields of the ProjectTranslation.
func (ProjectTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("project_id", uuid.UUID{}).
			StorageKey("project_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.String("project_type").
			Optional().
			MaxLen(50),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the ProjectTranslation.
func (ProjectTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("translations").
			Field("project_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("project_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
