package projects

import (
	"context"
	"math"
	"strconv"
	"strings"

	"silan-backend/internal/contentsearch"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/projecttechnology"
	"silan-backend/internal/ent/projecttranslation"
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
		Where(project.VisibilityEQ(project.VisibilityPublic)).
		WithTechnologies().
		WithTranslations()

	// Apply filters
	if req.Type != "" {
		query = query.Where(project.ProjectType(req.Type))
	}

	if req.Featured {
		query = query.Where(project.IsFeatured(true))
	}

	if req.Status != "" {
		query = query.Where(project.StatusEQ(project.Status(req.Status)))
	}

	if search := strings.TrimSpace(req.Search); search != "" {
		partIDs, partErr := contentsearch.EntityIDsMatchingParts(
			l.ctx, l.svcCtx.DB, itempart.EntityTypeProject, search, req.Language,
		)
		if partErr != nil {
			return nil, partErr
		}
		query = query.Where(project.Or(
			project.TitleContainsFold(search),
			project.DescriptionContainsFold(search),
			project.IDIn(partIDs...),
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

	projects, err := query.
		Order(ent.Desc(project.FieldSortOrder), ent.Desc(project.FieldCreatedAt)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	filtered := projects[:0]
	for _, proj := range projects {
		if req.Year > 0 && projectYear(proj) != req.Year {
			continue
		}
		filtered = append(filtered, proj)
	}

	total := len(filtered)
	offset := (req.Page - 1) * req.Size
	if offset > total {
		offset = total
	}
	end := offset + req.Size
	if end > total {
		end = total
	}

	result := make([]types.Project, 0, end-offset)
	for _, proj := range filtered[offset:end] {
		result = append(result, l.mapBasicProject(proj, req.Language))
	}

	totalPages := int(math.Ceil(float64(total) / float64(req.Size)))

	return &types.ProjectListResponse{
		Projects:   result,
		Total:      int64(total),
		Page:       req.Page,
		Size:       req.Size,
		TotalPages: totalPages,
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

func (l *GetProjectsLogic) mapBasicProject(proj *ent.Project, lang string) types.Project {
	// `Tags` is the project's content tags, read from the cross-type
	// `content_tag` table — the same source blog / idea / episode use. (The
	// `tech_stack` technologies are a separate concept; the engine does not
	// currently emit them, so `project_technologies` stays empty.)
	tags, tagErr := l.svcCtx.ContentTags.Lookup(l.ctx, "project", proj.ID)
	if tagErr != nil {
		l.Errorf("content_tag lookup for project %s: %v", proj.ID, tagErr)
	}

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
		ID:               proj.ID,
		Slug:             proj.Slug,
		Name:             name,
		Description:      description,
		Tags:             tags,
		Year:             year,
		IsFeatured:       proj.IsFeatured,
		Status:           string(proj.Status),
		StartDate:        proj.StartDate,
		EndDate:          proj.EndDate,
		GithubURL:        proj.GithubURL,
		DemoURL:          proj.DemoURL,
		DocumentationURL: proj.DocumentationURL,
		ThumbnailURL:     proj.ThumbnailURL,
		CoverSourceType:  projectCoverSourceType(l.ctx, l.svcCtx, proj.ID),
		CoverWebsiteURL:  projectCoverWebsiteURL(l.ctx, l.svcCtx, proj.ID),
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
