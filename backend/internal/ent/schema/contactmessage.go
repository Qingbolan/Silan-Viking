package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// ContactMessage is a message sent through the public contact page. It is a
// separate aggregate from content comments: contact messages have privacy,
// recruiter metadata, and a review lifecycle that comments do not own.
type ContactMessage struct {
	ent.Schema
}

func (ContactMessage) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "contact_messages"},
	}
}

func (ContactMessage) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.NewString() }),
		field.Enum("message_type").
			Values("general", "job"),
		field.String("author_name").
			MaxLen(100).
			NotEmpty(),
		field.String("author_email").
			MaxLen(255).
			NotEmpty(),
		field.String("author_avatar").
			Optional().
			MaxLen(1000),
		field.String("subject").
			Optional().
			MaxLen(240),
		field.Text("message").
			NotEmpty(),
		field.String("company").
			Optional().
			MaxLen(200),
		field.String("company_email").
			Optional().
			MaxLen(255),
		field.String("position").
			Optional().
			MaxLen(200),
		field.String("recruiter_name").
			Optional().
			MaxLen(100),
		field.String("recruiter_title").
			Optional().
			MaxLen(160),
		field.Bool("send_resume").
			Default(false),
		field.Bool("is_public").
			Default(false),
		field.Bool("consent_company_logo").
			Default(false),
		field.Enum("status").
			Values("pending", "read", "replied").
			Default("pending"),
		field.String("fingerprint").
			Optional().
			MaxLen(200),
		field.String("user_identity_id").
			Optional().
			MaxLen(100),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (ContactMessage) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("is_public", "created_at"),
		index.Fields("user_identity_id", "created_at"),
		index.Fields("author_email", "created_at"),
	}
}
