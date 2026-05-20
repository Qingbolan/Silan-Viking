package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ContentTag holds the schema definition for the unified cross-type tag
// association (M0.5b, docs/silan-viking/11 §11.6+; engine truth at
// engine/crates/silan-viking-app/src/sync/mapper/prose_mapper.rs:308). It
// replaces the legacy per-type junction tables (blog_post_tags, idea_tags,
// project tag joins). Each row links one Tag entity to one Item across any
// content type via (entity_type, entity_id) plus a denormalised entity_slug
// the frontend can resolve without a second lookup.
type ContentTag struct {
	ent.Schema
}

func (ContentTag) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "content_tag"},
	}
}

func (ContentTag) Fields() []ent.Field {
	return []ent.Field{
		field.String("tag_id").
			Comment("slug of the Tag entity (Tag.id)"),
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("entity_id").
			Comment("stable id of the tagged Item"),
		field.String("entity_slug").
			Comment("denormalised slug; lets list APIs resolve URLs without a second lookup"),
	}
}

func (ContentTag) Indexes() []ent.Index {
	return []ent.Index{
		// One association per (tag, entity) pair. Same tag on the same item
		// from two sync runs collapses to one row — matches the engine's
		// idempotent DELETE+INSERT contract.
		index.Fields("tag_id", "entity_type", "entity_id").Unique(),
		index.Fields("entity_type", "entity_id"),
		index.Fields("tag_id"),
	}
}
