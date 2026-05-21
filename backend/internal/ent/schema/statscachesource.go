package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// StatsCacheSource holds pre-aggregated traffic source counts per Item —
// the `silan stats sources` / MCP `source_breakdown` workload.
// Authoritative DDL: engine/crates/silan-viking-app/src/stats.rs:140.
type StatsCacheSource struct {
	ent.Schema
}

func (StatsCacheSource) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "stats_cache_source"},
	}
}

func (StatsCacheSource) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("entity_id"),
		field.Enum("source").
			Values("search", "social", "ai_chat", "direct", "internal", "unknown"),
		field.Int("count").Default(0),
		field.Time("synced_at").Default(time.Now),
	}
}

func (StatsCacheSource) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_type", "entity_id", "source").Unique(),
	}
}
