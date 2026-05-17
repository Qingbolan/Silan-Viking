package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// Annotation holds the schema definition for the annotation table
// (M0.5a, docs/silan-viking/11 §11.4). The whole table is classified as a
// runtime table; promote never touches it (11 §11.11).
type Annotation struct {
	ent.Schema
}

// Annotations for the Annotation schema.
func (Annotation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "annotation"},
	}
}

// Fields of the Annotation.
func (Annotation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("entity_id").
			StorageKey("entity_id"),
		// Which Part the annotation is anchored to.
		field.String("part_role").
			Optional().
			Nillable(),
		// Position within the Part.
		field.String("anchor").
			Optional().
			Nillable(),
		field.Text("body"),
		field.Enum("author_kind").
			Values("owner", "reader", "agent"),
		field.String("user_identity_id").
			Optional().
			Nillable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Indexes of the Annotation.
func (Annotation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_type", "entity_id"),
	}
}
