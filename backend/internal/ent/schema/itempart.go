package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// ItemPart holds the schema definition for the generic Part table
// (M0.5a, docs/silan-viking/11 §11.5). It is the landing table for Part
// bodies and replaces the text tab fields scattered across *_details /
// *_translations. It mirrors the engine's Parsed object (01 §1.8.0).
type ItemPart struct {
	ent.Schema
}

// Annotations for the ItemPart schema.
func (ItemPart) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "item_part"},
	}
}

// Fields of the ItemPart.
func (ItemPart) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		// p_<ulid>, sourced from meta.toml, stable across syncs.
		field.String("part_id"),
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("entity_id").
			StorageKey("entity_id"),
		// overview/progress/body/...
		field.String("role"),
		// = the SCHEMA Part's order.
		field.Int("sort_order").
			Default(0),
		field.String("canonical_lang"),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			Optional().
			UpdateDefault(time.Now),
	}
}

// Indexes of the ItemPart.
func (ItemPart) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("part_id").Unique(),
		index.Fields("entity_type", "entity_id"),
		index.Fields("entity_type", "entity_id", "role").Unique(),
	}
}

// Edges of the ItemPart.
func (ItemPart) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", ItemPartTranslation.Type),
		edge.To("entries", PartEntry.Type),
	}
}
