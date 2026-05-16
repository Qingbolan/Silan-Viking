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

// CommentLike holds the schema definition for the CommentLike entity.
type CommentLike struct {
	ent.Schema
}

// Annotations for the CommentLike schema.
func (CommentLike) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "comment_likes"},
	}
}

// Fields of the CommentLike.
func (CommentLike) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("comment_id", uuid.UUID{}).
			StorageKey("comment_id"),
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
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the CommentLike.
func (CommentLike) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("comment", BlogComment.Type).
			Ref("likes").
			Field("comment_id").
			Required().
			Unique(),
		edge.To("user_identity", UserIdentity.Type).
			Field("user_identity_id").
			Unique(),
	}
}

// Indexes of the CommentLike.
func (CommentLike) Indexes() []ent.Index {
	return []ent.Index{
		// Prevent duplicate likes from same user/fingerprint for same comment
		index.Fields("comment_id", "user_identity_id").Unique(),
		index.Fields("comment_id", "fingerprint").Unique(),
		// Performance indexes
		index.Fields("comment_id"),
		index.Fields("user_identity_id"),
	}
}