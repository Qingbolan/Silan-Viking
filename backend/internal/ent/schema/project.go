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

// Project holds the schema definition for the Project entity.
type Project struct {
	ent.Schema
}

// Annotations for the Project schema.
func (Project) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "projects"},
	}
}

// Fields of the Project.
func (Project) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			DefaultFunc(func() string { return uuid.New().String() }).
			StorageKey("id"),
		field.String("user_id").
			Optional().
			StorageKey("user_id"),
		field.String("title").
			MaxLen(300).
			Optional(),
		field.String("slug").
			MaxLen(200).
			Unique().
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.String("project_type").
			MaxLen(50).
			NotEmpty().
			Default("Web Application"),
		field.Enum("status").
			Values("active", "completed", "paused", "cancelled").
			Default("active"),
		field.Time("start_date").
			Optional().
			SchemaType(map[string]string{
				"mysql": "date",
			}),
		field.Time("end_date").
			Optional().
			SchemaType(map[string]string{
				"mysql": "date",
			}),
		field.String("github_url").
			Optional().
			MaxLen(500),
		field.String("demo_url").
			Optional().
			MaxLen(500),
		field.String("documentation_url").
			Optional().
			MaxLen(500),
		field.String("thumbnail_url").
			Optional().
			MaxLen(500),
		field.Bool("is_featured").
			Default(false),
		// M0.5a §11.7: is_public dropped, unified onto visibility (10 §10.3).
		// Default `private` — uniform with blog_posts / ideas: new content is
		// not public until the author explicitly publishes it (silan ruling).
		field.Enum("visibility").
			Values("private", "unlisted", "public").
			Default("private"),
		field.Int("view_count").
			Default(0),
		field.Int("like_count").
			Default(0),
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

// Edges of the Project.
func (Project) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("projects").
			Field("user_id").
			Unique(),
		edge.To("translations", ProjectTranslation.Type),
		edge.To("technologies", ProjectTechnology.Type),
		edge.To("details", ProjectDetail.Type).
			Unique(),
		edge.To("images", ProjectImage.Type),
		// source_relationships/target_relationships edges dropped (M0.5a
		// §11.9): project_relationships is replaced by content_relation.
		// likes/views edges stay until M0.5b drops the underlying tables.
		edge.To("likes", ProjectLike.Type),
		edge.To("views", ProjectView.Type),
	}
}
