package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
)

// StatsCacheItem is the per-Item summary row of the silan stats cache
// (M0.5b). The Rust engine maintains the authoritative DDL in
// engine/crates/silan-viking-app/src/stats.rs:114 — this ent shape mirrors
// it for the Go backend reading the cache.
//
// White-list class: remote cache. Not derived (markdown does not rebuild
// it) and not runtime truth (truth lives on the server); rebuilt by
// `silan stats sync` and skipped by promote replay.
type StatsCacheItem struct {
	ent.Schema
}

func (StatsCacheItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "stats_cache_item"},
	}
}

func (StatsCacheItem) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("entity_id"),
		field.Int("views").Default(0),
		field.Int("likes").Default(0),
		field.Int("comments").Default(0),
		field.Time("synced_at").Default(time.Now),
	}
}
