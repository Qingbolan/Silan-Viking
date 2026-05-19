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

// PartEntryTranslation holds the language-dependent fields of a PartEntry
// (M0.5a, docs/silan-viking/11 §11.5.1).
type PartEntryTranslation struct {
	ent.Schema
}

// Annotations for the PartEntryTranslation schema.
func (PartEntryTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "part_entry_translation"},
	}
}

// Fields of the PartEntryTranslation.
func (PartEntryTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("part_entry_id").
			StorageKey("part_entry_id"),
		field.String("language_code"),
		// Language-dependent fields (title/details/description/...). The
		// entry_fields with translatable=true; also SCHEMA-validated typed JSON.
		field.JSON("localized_payload", map[string]any{}),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Indexes of the PartEntryTranslation.
func (PartEntryTranslation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("part_entry_id", "language_code").Unique(),
	}
}

// Edges of the PartEntryTranslation.
func (PartEntryTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("part_entry", PartEntry.Type).
			Ref("translations").
			Field("part_entry_id").
			Required().
			Unique(),
	}
}
