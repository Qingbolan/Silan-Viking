package projects

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/projecttechnology"
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
		WithUser().
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

	if req.Search != "" {
		query = query.Where(project.Or(
			project.TitleContains(req.Search),
			project.DescriptionContains(req.Search),
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

	yearFilter := req.Year
	if yearFilter == 0 && req.AnnualPlan != "" {
		yearFilter, _ = parsePlanYear(req.AnnualPlan)
	}

	filtered := projects[:0]
	for _, proj := range projects {
		if yearFilter > 0 && projectYear(proj) != yearFilter {
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
		result = append(result, mapBasicProject(proj, req.Language))
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

func mapBasicProject(proj *ent.Project, lang string) types.Project {
	technologies := make([]string, 0, len(proj.Edges.Technologies))
	for _, tech := range proj.Edges.Technologies {
		technologies = append(technologies, tech.TechnologyName)
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
		ID:          proj.ID,
		Name:        name,
		Description: description,
		Tags:        technologies,
		Year:        year,
		AnnualPlan:  fmt.Sprintf("Annual Plan %d", year),
	}
}

func projectYear(proj *ent.Project) int {
	if !proj.StartDate.IsZero() {
		return proj.StartDate.Year()
	}
	return proj.CreatedAt.Year()
}

func parsePlanYear(name string) (int, bool) {
	match := regexp.MustCompile(`\d{4}`).FindString(strings.TrimSpace(name))
	if match == "" {
		return 0, false
	}
	year, err := strconv.Atoi(match)
	if err != nil {
		return 0, false
	}
	return year, true
}
