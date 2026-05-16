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

// ProjectImage holds the schema definition for the ProjectImage entity.
type ProjectImage struct {
	ent.Schema
}

// Annotations for the ProjectImage schema.
func (ProjectImage) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_images"},
	}
}

// Fields of the ProjectImage.
func (ProjectImage) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("project_id", uuid.UUID{}).
			StorageKey("project_id"),
		field.String("image_url").
			MaxLen(500).
			NotEmpty(),
		field.String("alt_text").
			Optional().
			MaxLen(200),
		field.Text("caption").
			Optional(),
		field.String("image_type").
			Optional().
			MaxLen(50),
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

// Edges of the ProjectImage.
func (ProjectImage) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("images").
			Field("project_id").
			Required().
			Unique(),
		edge.To("translations", ProjectImageTranslation.Type),
	}
}
