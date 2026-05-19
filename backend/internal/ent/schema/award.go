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

// Award holds the schema definition for the Award entity.
type Award struct {
	ent.Schema
}

// Annotations for the Award schema.
func (Award) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "awards"},
	}
}

// Fields of the Award.
func (Award) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			StorageKey("user_id"),
		field.String("title").
			MaxLen(300).
			NotEmpty(),
		field.String("awarding_organization").
			MaxLen(200).
			NotEmpty(),
		field.String("award_date").Optional(),
		field.String("award_type").
			Optional().
			MaxLen(50),
		field.Float("amount").
			Optional(),
		field.Text("description").
			Optional(),
		field.String("certificate_url").
			Optional().
			MaxLen(500),
		field.Int("sort_order").
			Default(0),
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

// Edges of the Award.
func (Award) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", AwardTranslation.Type),
	}
}
