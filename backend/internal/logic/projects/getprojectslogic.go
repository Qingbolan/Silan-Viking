package projects

import (
	"context"
	"strconv"
	"strings"

	"silan-backend/internal/contentsearch"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/projecttechnology"
	"silan-backend/internal/ent/projecttranslation"
	"silan-backend/internal/pagination"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get projects list with pagination and filtering
func NewGetProjectsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectsLogic {
	return &GetProjectsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectsLogic) GetProjects(req *types.ProjectListRequest) (resp *types.ProjectListResponse, err error) {
	query := l.svcCtx.DB.Project.Query().
		Where(publicProject()).
		WithTechnologies().
		WithTranslations()

	// Apply filters
	if req.Type != "" {
		query = query.Where(project.ProjectType(req.Type))
	}

	if req.Featured {
		query = query.Where(project.IsFeatured(true))
	}

	if search := strings.TrimSpace(req.Search); search != "" {
		query = query.Where(project.Or(
			project.TitleContainsFold(search),
			project.DescriptionContainsFold(search),
			contentsearch.MatchesParts(itempart.EntityTypeProject, search, req.Language),
			project.HasTranslationsWith(
				projecttranslation.LanguageCodeIn(contentsearch.Languages(req.Language)...),
				projecttranslation.Or(
					projecttranslation.TitleContainsFold(search),
					projecttranslation.DescriptionContainsFold(search),
				),
			),
		))
	}

	if req.Tags != "" {
		for _, tag := range splitCSV(req.Tags) {
			query = query.Where(project.HasTechnologiesWith(projecttechnology.TechnologyNameEqualFold(tag)))
		}
	}

	if req.Year > 0 {
		query = query.Where(projectInYear(req.Year))
	}
	total, err := query.Clone().Count(l.ctx)
	if err != nil {
		return nil, err
	}
	page := pagination.New(req.Page, req.Size, 0)
	pageProjects := []*ent.Project{}
	if offset, ok := page.Offset(total); ok {
		pageProjects, err = query.Order(ent.Desc(project.FieldSortOrder), ent.Desc(project.FieldCreatedAt), ent.Asc(project.FieldID)).Offset(offset).Limit(page.Size).All(l.ctx)
		if err != nil {
			return nil, err
		}
	}
	ids := make([]string, 0, len(pageProjects))
	for _, proj := range pageProjects {
		ids = append(ids, proj.ID)
	}
	tags, tagErr := l.svcCtx.ContentTags.LookupMany(l.ctx, "project", ids)
	if tagErr != nil {
		l.Errorf("content_tag lookup for project page: %v", tagErr)
	}
	result := make([]types.Project, 0, len(pageProjects))
	for _, proj := range pageProjects {
		result = append(result, mapBasicProject(proj, req.Language, tags[proj.ID]))
	}

	return &types.ProjectListResponse{
		Projects:   result,
		Total:      int64(total),
		Page:       page.Number,
		Size:       page.Size,
		TotalPages: page.TotalPages(total),
	}, nil
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

func mapBasicProject(proj *ent.Project, lang string, tags []string) types.Project {
	// Resolve language-variant fields from project_translations: the content
	// engine leaves title/description empty on the main projects row.
	name := proj.Title
	description := proj.Description
	if tr := pickProjectTranslation(proj.Edges.Translations, lang); tr != nil {
		if tr.Title != "" {
			name = tr.Title
		}
		if tr.Description != "" {
			description = tr.Description
		}
	}

	year := projectYear(proj)
	return types.Project{
		ID:          proj.ID,
		Slug:        proj.Slug,
		Name:        name,
		Description: description,
		Tags:        tags,
		Year:        year,
		IsFeatured:  proj.IsFeatured,

		StartDate:        proj.StartDate,
		EndDate:          proj.EndDate,
		GithubURL:        proj.GithubURL,
		DemoURL:          proj.DemoURL,
		DocumentationURL: proj.DocumentationURL,
		ThumbnailURL:     proj.ThumbnailURL,
		CoverSourceType:  string(proj.CoverSourceType),
		CoverWebsiteURL:  strings.TrimSpace(proj.CoverWebsiteURL),
		UpdatedAt:        formatContentTime(proj.UpdatedAt, "2006-01-02T15:04:05Z07:00"),
	}
}

func projectYear(proj *ent.Project) int {
	// `start_date` is a plain `YYYY-MM-DD` string; fall back to created-at.
	if len(proj.StartDate) >= 4 {
		if y, err := strconv.Atoi(proj.StartDate[:4]); err == nil {
			return y
		}
	}
	return proj.CreatedAt.Year()
}
