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

	var features []string
	var fullDescription string
	if proj.Edges.Details != nil {
		fullDescription = proj.Edges.Details.DetailedDescription
		// Note: Features field might need to be properly handled based on the actual schema
	}

	// Handle description field (now non-nullable)
	description := proj.Description

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
		userID = proj.Edges.User.ID.String()
	}

	return &types.ProjectExtended{
		ID:               proj.ID.String(),
		UserID:           userID,
		Title:            proj.Title,
		Slug:             proj.Slug,
		Description:      description,
		FullDescription:  fullDescription,
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
		IsPublic:         proj.IsPublic,
		ViewCount:        int64(proj.ViewCount),
		StarCount:        int64(proj.StarCount),
		SortOrder:        proj.SortOrder,
		Year:             year,
		AnnualPlan:       annualPlan,
		Features:         features,
		CreatedAt:        proj.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:        proj.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}
