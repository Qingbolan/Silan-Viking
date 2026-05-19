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

// ContentRelation holds the schema definition for the unified content relation
// table (M0.5a, docs/silan-viking/11 §11.2). It replaces project_relationships
// and carries every cross-type edge (evolved_into, documents, references, ...).
type ContentRelation struct {
	ent.Schema
}

// Annotations for the ContentRelation schema.
func (ContentRelation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "content_relation"},
	}
}

// Fields of the ContentRelation.
func (ContentRelation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.Enum("from_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("from_id").
			StorageKey("from_id"),
		field.Enum("to_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("to_id").
			StorageKey("to_id"),
		// Only canonical directions are stored; evolved_from is the flip of
		// evolved_into and never enters the table (10 §10.5).
		field.Enum("relation_type").
			Values("evolved_into", "documents", "references",
				"supersedes", "part_of"),
		// The silan-viking engine writes this only for ordered relation
		// types (`part_of`); it is NULL otherwise, so it must be optional.
		field.Int("sort_order").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Indexes of the ContentRelation.
func (ContentRelation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("from_type", "from_id", "to_type", "to_id",
			"relation_type").Unique(),
		index.Fields("from_type", "from_id"),
		index.Fields("to_type", "to_id"),
	}
}
