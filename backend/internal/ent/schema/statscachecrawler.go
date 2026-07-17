package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// StatsCacheCrawler holds pre-aggregated visitor_kind counts per Item — the
// `silan stats crawlers` / MCP `crawler_breakdown` workload. Authoritative
// DDL: engine/crates/silan-viking-app/src/stats.rs:133.
type StatsCacheCrawler struct {
	ent.Schema
}

func (StatsCacheCrawler) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "stats_cache_crawler"},
	}
}

func (StatsCacheCrawler) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "moment"),
		field.String("entity_id"),
		field.Enum("visitor_kind").
			Values("human", "search_bot", "ai_bot", "unknown"),
		field.Int("count").Default(0),
		field.Time("synced_at").Default(time.Now),
	}
}

func (StatsCacheCrawler) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_type", "entity_id", "visitor_kind").Unique(),
	}
}
