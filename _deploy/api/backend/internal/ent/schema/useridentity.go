package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// UserIdentity stores third-party OAuth identity and profile (including avatar)
type UserIdentity struct {
	ent.Schema
}

func (UserIdentity) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "user_identities"},
	}
}

func (UserIdentity) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").Immutable(),
		field.String("provider").NotEmpty(),
		field.String("external_id").NotEmpty(),
		field.String("email").Optional(),
		field.String("display_name").Optional(),
		field.String("avatar_url").Optional(),
		field.Bool("verified").Default(false),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (UserIdentity) Indexes() []ent.Index {
	return []ent.Index{
		// Unique identity per provider
		index.Fields("provider", "external_id").Unique(),
		// Lookup by email for convenience
		index.Fields("email"),
	}
}
