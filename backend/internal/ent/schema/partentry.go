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

// PartEntry holds the schema definition for one entry of an entry_list Part
// (M0.5a, docs/silan-viking/11 §11.5.1, ruling #2). Resume's structured Parts
// (education, work_experience, ...) all land here instead of dedicated tables.
type PartEntry struct {
	ent.Schema
}

// Annotations for the PartEntry schema.
func (PartEntry) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "part_entry"},
	}
}

// Fields of the PartEntry.
func (PartEntry) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		// Which entry_list Part this entry belongs to.
		field.UUID("item_part_id", uuid.UUID{}).
			StorageKey("item_part_id"),
		// e_<ulid>, sourced from the TOML, stable across syncs. The stable
		// anchor of an entry, what part_id is to a Part.
		field.String("entry_id"),
		field.Int("sort_order").
			Default(0),
		// Language-independent fields (date/url/logo/bool/...). SCHEMA-validated
		// typed JSON keyed by the entry_fields with translatable=false; not an
		// unconstrained blob. sync must validate against entry_fields before
		// writing.
		field.JSON("shared_payload", map[string]any{}),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Indexes of the PartEntry.
func (PartEntry) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("item_part_id"),
		index.Fields("item_part_id", "entry_id").Unique(),
	}
}

// Edges of the PartEntry.
func (PartEntry) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("item_part", ItemPart.Type).
			Ref("entries").
			Field("item_part_id").
			Required().
			Unique(),
		edge.To("translations", PartEntryTranslation.Type),
	}
}
