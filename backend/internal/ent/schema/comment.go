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

// Comment holds the schema definition for the unified Comment entity.
type Comment struct {
	ent.Schema
}

// Annotations for the Comment schema.
func (Comment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "comments"},
	}
}

// Fields of the Comment.
func (Comment) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.Enum("entity_type").
			Values("blog", "project", "idea", "episode", "resume", "update").
			Comment("Type of the commented entity (M0.5a §11.6: enum)"),
		field.String("entity_id").
			StorageKey("entity_id").
			Comment("ID of the blog post or idea"),
		field.String("parent_id").
			Optional().
			StorageKey("parent_id"),
		field.String("author_name").
			MaxLen(100).
			NotEmpty(),
		field.String("author_email").
			MaxLen(255).
			NotEmpty(),
		field.String("author_website").
			Optional().
			MaxLen(500),
		field.Text("content").
			NotEmpty(),
		field.Enum("type").
			Values("general", "question", "feedback").
			Default("general").
			Comment("Type of comment (M0.5a §11.6: enum)"),
		// Renamed from referrence_id (M0.5a §11.6). The runtime migration
		// must ALTER TABLE comments RENAME COLUMN, not drop+add.
		field.String("reference_id").
			Optional().
			MaxLen(500).
			StorageKey("reference_id"),
		field.String("attachment_id").
			Optional().
			MaxLen(500),
		field.Bool("is_approved").
			Default(false),
		field.String("ip_address").
			Optional().
			MaxLen(45),
		field.String("user_agent").
			Optional().
			MaxLen(500),
		field.String("user_identity_id").
			Optional().
			Comment("Link to authenticated user identity if available"),
		field.Int("likes_count").
			Default(0).
			Comment("Number of likes for this comment"),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Indexes of the Comment.
func (Comment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_type", "entity_id"),
		index.Fields("parent_id"),
	}
}

// Edges of the Comment.
func (Comment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("parent", Comment.Type).
			Field("parent_id").
			Unique(),
		edge.From("replies", Comment.Type).
			Ref("parent"),
		edge.To("user_identity", UserIdentity.Type).
			Field("user_identity_id").
			Unique(),
	}
}
