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

// Publication holds the schema definition for the Publication entity.
type Publication struct {
	ent.Schema
}

// Annotations for the Publication schema.
func (Publication) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "publications"},
	}
}

// Fields of the Publication.
func (Publication) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("user_id", uuid.UUID{}).
			StorageKey("user_id"),
		field.String("title").
			MaxLen(500).
			NotEmpty(),
		field.String("publication_type").
			MaxLen(50).
			NotEmpty(),
		field.String("journal_name").
			Optional().
			MaxLen(200),
		field.String("conference_name").
			Optional().
			MaxLen(200),
		field.String("volume").
			Optional().
			MaxLen(20),
		field.String("issue").
			Optional().
			MaxLen(20),
		field.String("pages").
			Optional().
			MaxLen(50),
		field.Time("publication_date").
			Optional().
			SchemaType(map[string]string{
				"mysql": "date",
			}),
		field.String("doi").
			Optional().
			MaxLen(100),
		field.String("isbn").
			Optional().
			MaxLen(20),
		field.String("url").
			Optional().
			MaxLen(500),
		field.String("pdf_url").
			Optional().
			MaxLen(500),
		field.Int("citation_count").
			Default(0),
		field.Bool("is_peer_reviewed").
			Default(false),
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the Publication.
func (Publication) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("publications").
			Field("user_id").
			Required().
			Unique(),
		edge.To("translations", PublicationTranslation.Type),
		edge.To("authors", PublicationAuthor.Type),
	}
}
