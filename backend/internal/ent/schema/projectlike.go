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

// ProjectLike holds the schema definition for the ProjectLike entity.
type ProjectLike struct {
	ent.Schema
}

// Annotations for the ProjectLike schema.
func (ProjectLike) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "project_likes"},
	}
}

// Fields of the ProjectLike.
func (ProjectLike) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("project_id").
			StorageKey("project_id").
			Comment("Project ID that was liked"),
		field.String("user_identity_id").
			Optional().
			Comment("ID of the authenticated user who liked"),
		field.String("fingerprint").
			Optional().
			Comment("Browser fingerprint for anonymous likes"),
		field.String("ip_address").
			Optional().
			MaxLen(45).
			Comment("IP address of the user who liked"),
		field.String("user_agent").
			Optional().
			Comment("User agent string"),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the ProjectLike.
//
// `project_id` is a plain field, not an edge — a soft reference to a
// `projects` row. `project_likes` is a runtime table; `projects` is
// engine-derived and replaced wholesale by promote on every content sync.
// A DB-level FK would dangle the moment promote rebuilds `projects` and
// abort the promote transaction. See `ProjectView.Edges` for the full
// rationale.
func (ProjectLike) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("user_identity", UserIdentity.Type).
			Field("user_identity_id").
			Unique(),
	}
}

// Indexes of the ProjectLike.
func (ProjectLike) Indexes() []ent.Index {
	return []ent.Index{
		// Prevent duplicate likes from same user/fingerprint for same project
		index.Fields("project_id", "user_identity_id").Unique(),
		index.Fields("project_id", "fingerprint").Unique(),
		// Performance indexes
		index.Fields("project_id"),
		index.Fields("user_identity_id"),
		index.Fields("ip_address"),
	}
}
