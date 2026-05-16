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

// ProjectImageTranslation holds the schema definition for the ProjectImageTranslation entity.
type ProjectImageTranslation struct {
	ent.Schema
}

// Annotations for the ProjectImageTranslation schema.
func (ProjectImageTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_image_translations"},
	}
}

// Fields of the ProjectImageTranslation.
func (ProjectImageTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("project_image_id", uuid.UUID{}).
			StorageKey("project_image_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("alt_text").
			Optional().
			MaxLen(200),
		field.Text("caption").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the ProjectImageTranslation.
func (ProjectImageTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project_image", ProjectImage.Type).
			Ref("translations").
			Field("project_image_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("project_image_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
