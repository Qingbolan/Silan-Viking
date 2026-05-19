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

// PersonalInfoTranslation holds the schema definition for the PersonalInfoTranslation entity.
type PersonalInfoTranslation struct {
	ent.Schema
}

// Annotations for the PersonalInfoTranslation schema.
func (PersonalInfoTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "personal_info_translations"},
	}
}

// Fields of the PersonalInfoTranslation.
func (PersonalInfoTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("personal_info_id").
			StorageKey("personal_info_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("full_name").
			Optional().
			MaxLen(200),
		field.String("title").
			Optional().
			MaxLen(200),
		field.Text("current_status").
			Optional(),
		field.String("location").
			Optional().
			MaxLen(200),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Edges of the PersonalInfoTranslation.
func (PersonalInfoTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("personal_info", PersonalInfo.Type).
			Ref("translations").
			Field("personal_info_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("personal_info_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
