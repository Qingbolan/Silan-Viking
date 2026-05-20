package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// StatsCacheVisitor caches one row per observed visitor of an Item. The
// authoritative DDL is in engine/crates/silan-viking-app/src/stats.rs:123.
// `ip_masked` is always the pre-anonymised value; raw IPs never leave the
// server (08 §8.4).
type StatsCacheVisitor struct {
	ent.Schema
}

func (StatsCacheVisitor) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "stats_cache_visitor"},
	}
}

func (StatsCacheVisitor) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update"),
		field.String("entity_id"),
		field.String("fingerprint"),
		field.String("ip_masked").
			Comment("anonymised IP, e.g. `203.0.113.0/24`; raw IP never leaves the server"),
		field.Enum("visitor_kind").
			Values("human", "search_bot", "ai_bot", "unknown").
			Default("unknown"),
		field.Enum("referrer_kind").
			Values("search", "social", "ai_chat", "direct", "internal", "unknown").
			Default("unknown"),
		field.Time("last_seen_at"),
		field.Time("synced_at").Default(time.Now),
	}
}

func (StatsCacheVisitor) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_type", "entity_id"),
		index.Fields("entity_type", "entity_id", "visitor_kind"),
	}
}
