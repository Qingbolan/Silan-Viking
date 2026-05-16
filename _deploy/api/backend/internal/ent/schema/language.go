package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Language holds the schema definition for the Language entity.
type Language struct {
	ent.Schema
}

// Annotations for the Language schema.
func (Language) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "languages"},
	}
}

// Fields of the Language.
func (Language) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").
			MaxLen(5).
			NotEmpty().
			Unique().
			Immutable().
			StorageKey("code").
			StructTag(`json:"code"`),
		field.String("name").
			MaxLen(50).
			NotEmpty(),
		field.String("native_name").
			MaxLen(50).
			NotEmpty(),
		field.Bool("is_active").
			Default(true),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the Language.
func (Language) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("personal_info_translations", PersonalInfoTranslation.Type),
		edge.To("education_translations", EducationTranslation.Type),
		edge.To("education_detail_translations", EducationDetailTranslation.Type),
		edge.To("work_experience_translations", WorkExperienceTranslation.Type),
		edge.To("work_experience_detail_translations", WorkExperienceDetailTranslation.Type),
		edge.To("project_translations", ProjectTranslation.Type),
		edge.To("project_detail_translations", ProjectDetailTranslation.Type),
		edge.To("project_image_translations", ProjectImageTranslation.Type),
		edge.To("blog_category_translations", BlogCategoryTranslation.Type),
		edge.To("blog_post_translations", BlogPostTranslation.Type),
		edge.To("blog_series_translations", BlogSeriesTranslation.Type),
		edge.To("idea_translations", IdeaTranslation.Type),
		edge.To("research_project_translations", ResearchProjectTranslation.Type),
		edge.To("research_project_detail_translations", ResearchProjectDetailTranslation.Type),
		edge.To("publication_translations", PublicationTranslation.Type),
		edge.To("award_translations", AwardTranslation.Type),
		edge.To("recent_update_translations", RecentUpdateTranslation.Type),
	}
}
