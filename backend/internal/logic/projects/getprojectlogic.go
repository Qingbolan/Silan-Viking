package projects

import (
	"context"
	"fmt"
	"strconv"

	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get single project by slug
func NewGetProjectLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectLogic {
	return &GetProjectLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectLogic) GetProject(req *types.ProjectRequest) (resp *types.ProjectExtended, err error) {
	proj, err := l.svcCtx.DB.Project.Query().
		Where(project.Slug(req.Slug)).
		WithTechnologies().
		WithDetails().
		WithImages().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Dates are stored as plain strings by the silan-viking engine.
	startDate := proj.StartDate
	endDate := proj.EndDate

	var technologies []string
	for _, tech := range proj.Edges.Technologies {
		technologies = append(technologies, tech.TechnologyName)
	}

	// title/description live in project_translations — the content engine
	// leaves the main projects row's title/description empty.
	title := proj.Title
	description := proj.Description
	if tr := pickProjectTranslation(proj.Edges.Translations, req.Language); tr != nil {
		if tr.Title != "" {
			title = tr.Title
		}
		if tr.Description != "" {
			description = tr.Description
		}
	}

	// Generate annual plan name based on year. `start_date` is a plain
	// `YYYY-MM-DD` string; fall back to the created-at timestamp.
	year := proj.CreatedAt.Year()
	if len(proj.StartDate) >= 4 {
		if y, err := strconv.Atoi(proj.StartDate[:4]); err == nil {
			year = y
		}
	}
	annualPlan := fmt.Sprintf("Annual Plan %d", year)

	// Handle URL fields (now non-nullable)
	githubURL := proj.GithubURL
	demoURL := proj.DemoURL
	documentationURL := proj.DocumentationURL
	thumbnailURL := proj.ThumbnailURL

	// Single-owner system: a project has no per-item user/author.
	var userID string

	return &types.ProjectExtended{
		ID:               proj.ID,
		UserID:           userID,
		Title:            title,
		Slug:             proj.Slug,
		Description:      description,
		ProjectType:      proj.ProjectType,
		Status:           string(proj.Status),
		StartDate:        startDate,
		EndDate:          endDate,
		Technologies:     technologies,
		GithubURL:        githubURL,
		DemoURL:          demoURL,
		DocumentationURL: documentationURL,
		ThumbnailURL:     thumbnailURL,
		IsFeatured:       proj.IsFeatured,
		IsPublic:         proj.Visibility == project.VisibilityPublic,
		ViewCount:        int64(proj.ViewCount),
		SortOrder:        proj.SortOrder,
		Year:             year,
		AnnualPlan:       annualPlan,
		CreatedAt:        proj.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:        proj.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}
