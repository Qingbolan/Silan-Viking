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

// PublicationTranslation holds the schema definition for the PublicationTranslation entity.
type PublicationTranslation struct {
	ent.Schema
}

// Annotations for the PublicationTranslation schema.
func (PublicationTranslation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "publication_translations"},
	}
}

// Fields of the PublicationTranslation.
func (PublicationTranslation) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("publication_id").
			StorageKey("publication_id"),
		field.String("language_code").
			MaxLen(5).
			StorageKey("language_code"),
		field.String("title").
			MaxLen(500).
			Optional(),
		field.String("journal_name").
			Optional().
			MaxLen(200),
		field.String("conference_name").
			Optional().
			MaxLen(200),
		field.Time("created_at").
			Default(time.Now).
			Optional().
			Immutable(),
	}
}

// Edges of the PublicationTranslation.
func (PublicationTranslation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("publication", Publication.Type).
			Ref("translations").
			Field("publication_id").
			Required().
			Unique(),
		edge.From("language", Language.Type).
			Ref("publication_translations").
			Field("language_code").
			Required().
			Unique(),
	}
}
