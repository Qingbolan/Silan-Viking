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
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("comment_id").
			StorageKey("comment_id").
			Comment("Generic comment ID - can reference any Comment"),
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
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the CommentLike.
func (CommentLike) Edges() []ent.Edge {
	return []ent.Edge{
		// Note: comment_id is a generic field that can reference either BlogComment or IdeaComment
		// The relationships to comments are handled through reverse edges in those entities
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
