package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

// Annotations for the User schema.
func (User) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "users"},
	}
}

// Fields of the User.
func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("username").
			Unique().
			MaxLen(50).
			NotEmpty(),
		field.String("email").
			Unique().
			MaxLen(255).
			NotEmpty(),
		field.String("password_hash").
			MaxLen(255).
			NotEmpty(),
		field.String("first_name").
			MaxLen(100).
			NotEmpty(),
		field.String("last_name").
			MaxLen(100).
			NotEmpty(),
		field.String("avatar_url").
			Optional().
			MaxLen(500),
		field.Text("bio").
			Optional(),
		field.Bool("is_active").
			Default(true),
		field.Bool("is_admin").
			Default(false),
		field.Time("last_login_at").
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			Optional().
			UpdateDefault(time.Now),
	}
}

// Edges of the User.
//
// silan-viking is a single-owner system: content has no per-item author, so
// `users` carries no edge to any content type — the engine's content tables
// have no `user_id` relationship. `users` is a runtime table, used by the
// comment flow (a comment's author is a real, separate user).
func (User) Edges() []ent.Edge {
	return []ent.Edge{}
}
