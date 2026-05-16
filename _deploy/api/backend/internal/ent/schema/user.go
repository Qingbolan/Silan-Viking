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
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
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
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the User.
func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("personal_infos", PersonalInfo.Type),
		edge.To("educations", Education.Type),
		edge.To("work_experiences", WorkExperience.Type),
		edge.To("projects", Project.Type),
		edge.To("blog_posts", BlogPost.Type),
		edge.To("ideas", Idea.Type),
		edge.To("research_projects", ResearchProject.Type),
		edge.To("publications", Publication.Type),
		edge.To("awards", Award.Type),
		edge.To("recent_updates", RecentUpdate.Type),
	}
}
