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

// ItemPartTranslation holds the per-language body variant of an ItemPart
// (M0.5a, docs/silan-viking/11 §11.5).
type ItemPartTranslation struct {
	ent.Schema
}

// Annotations for the ItemPartTranslation schema.
func (ItemPartTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "item_part_translation"},
	}
}

// Fields of the ItemPartTranslation.
func (ItemPartTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("item_part_id", uuid.UUID{}).
			StorageKey("item_part_id"),
		field.String("language_code"),
		// The body of this Part in this language.
		field.Text("body"),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Indexes of the ItemPartTranslation.
func (ItemPartTranslation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("item_part_id", "language_code").Unique(),
	}
}

// Edges of the ItemPartTranslation.
func (ItemPartTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("item_part", ItemPart.Type).
			Ref("translations").
			Field("item_part_id").
			Required().
			Unique(),
	}
}
