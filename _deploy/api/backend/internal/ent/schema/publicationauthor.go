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

// PublicationAuthor holds the schema definition for the PublicationAuthor entity.
type PublicationAuthor struct {
	ent.Schema
}

// Annotations for the PublicationAuthor schema.
func (PublicationAuthor) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "publication_authors"},
	}
}

// Fields of the PublicationAuthor.
func (PublicationAuthor) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			StorageKey("id"),
		field.UUID("publication_id", uuid.UUID{}).
			StorageKey("publication_id"),
		field.String("author_name").
			MaxLen(200).
			NotEmpty(),
		field.Int("author_order"),
		field.Bool("is_corresponding").
			Default(false),
		field.String("affiliation").
			Optional().
			MaxLen(300),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the PublicationAuthor.
func (PublicationAuthor) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("publication", Publication.Type).
			Ref("authors").
			Field("publication_id").
			Required().
			Unique(),
	}
}
