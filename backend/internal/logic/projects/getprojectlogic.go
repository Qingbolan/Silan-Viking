package projects

import (
	"context"
	"fmt"

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
		WithUser().
		WithTechnologies().
		WithDetails().
		WithImages().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	var startDate, endDate string
	if !proj.StartDate.IsZero() {
		startDate = proj.StartDate.Format("2006-01-02")
	}
	if !proj.EndDate.IsZero() {
		endDate = proj.EndDate.Format("2006-01-02")
	}

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

	// Generate annual plan name based on year
	year := proj.CreatedAt.Year()
	if !proj.StartDate.IsZero() {
		year = proj.StartDate.Year()
	}
	annualPlan := fmt.Sprintf("Annual Plan %d", year)

	// Handle URL fields (now non-nullable)
	githubURL := proj.GithubURL
	demoURL := proj.DemoURL
	documentationURL := proj.DocumentationURL
	thumbnailURL := proj.ThumbnailURL

	// Get user ID from edge relationship
	var userID string
	if proj.Edges.User != nil {
		userID = proj.Edges.User.ID
	}

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
