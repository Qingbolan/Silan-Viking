package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Tag holds the schema definition for the unified Tag entity (M0.5b). The
// engine writes one row per distinct tag slug across all content types
// (engine/crates/silan-viking-app/src/sync/mapper/prose_mapper.rs:302); the
// content_tag join table fans it out per Item. `id` is the slug itself so
// the same tag from a blog and an idea folds to a single row.
type Tag struct {
	ent.Schema
}

func (Tag) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "tag"},
	}
}

func (Tag) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			Comment("normalised slug; same value as `slug`. Primary key."),
		field.String("slug").
			Comment("kebab-case slug, e.g. `ai-ml`"),
		field.String("label").
			Comment("original free-text label, e.g. `AI / ML`"),
	}
}

func (Tag) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("slug").Unique(),
	}
}
