package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// BlogComment holds the schema definition for the BlogComment entity.
type BlogComment struct {
	ent.Schema
}

// Annotations for the BlogComment schema.
func (BlogComment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "blog_comments"},
	}
}

// Fields of the BlogComment.
func (BlogComment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("blog_post_id", uuid.UUID{}).
			StorageKey("blog_post_id"),
		field.UUID("parent_id", uuid.UUID{}).
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

// Edges of the BlogComment.
func (BlogComment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("blog_post", BlogPost.Type).
			Ref("comments").
			Field("blog_post_id").
			Required().
			Unique(),
		edge.To("parent", BlogComment.Type).
			Field("parent_id").
			Unique(),
		edge.From("replies", BlogComment.Type).
			Ref("parent"),
		edge.To("user_identity", UserIdentity.Type).
			Field("user_identity_id").
			Unique(),
		edge.To("likes", CommentLike.Type),
	}
}
