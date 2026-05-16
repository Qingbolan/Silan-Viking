package projects

import (
	"context"
	"strings"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectDetailLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get detailed project information
func NewGetProjectDetailLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectDetailLogic {
	return &GetProjectDetailLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectDetailLogic) GetLicenseText(str string) string {
	if str == "" {
		return "MIT"
	}

	str = strings.TrimSpace(str)
	if str == "" {
		return "MIT"
	}

	// Simple license detection
	lower := strings.ToLower(str)

	if strings.Contains(lower, "mit") {
		return "MIT"
	}
	if strings.Contains(lower, "apache") {
		return "Apache 2.0"
	}
	if strings.Contains(lower, "gpl") || strings.Contains(lower, "gnu") {
		return "GPL"
	}
	if strings.Contains(lower, "bsd") {
		return "BSD"
	}

	// If it's a short string, return it directly
	if len(str) <= 50 {
		return str
	}

	// For longer text, return first 50 chars
	return str[:50] + "..."
}

func (l *GetProjectDetailLogic) GetProjectDetail(req *types.ProjectDetailRequest) (resp *types.ProjectDetail, err error) {
	projectUUID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, err
	}

	// Fetch project with all related data including details
	proj, err := l.svcCtx.DB.Project.Query().
		Where(project.ID(projectUUID)).
		Where(project.IsPublic(true)).
		WithUser().
		WithTechnologies().
		WithDetails().
		WithImages().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Get basic project information
	var startDate, endDate string
	if !proj.StartDate.IsZero() {
		startDate = proj.StartDate.Format("2006-01-02")
	}
	if !proj.EndDate.IsZero() {
		endDate = proj.EndDate.Format("2006-01-02")
	}

	// Parse timeline
	var timeline types.ProjectTimeline
	timeline.Start = startDate
	timeline.End = endDate
	if startDate != "" && endDate != "" {
		timeline.Duration = "Completed"
	} else if startDate != "" {
		timeline.Duration = "In Progress"
	} else {
		timeline.Duration = ""
	}

	// Parse metrics
	var metrics types.ProjectMetrics
	metrics.LinesOfCode = 0 // These could be calculated from git repos
	metrics.Commits = 0
	metrics.Stars = proj.StarCount
	metrics.Downloads = 0

	// Create detail information
	var detailID string
	var detailedDescription, goals, challenges, solutions, lessonsLearned, futureEnhancements, license, version string
	var licenseText string
	var createdAt, updatedAt string
	if proj.Edges.Details != nil {
		detail := proj.Edges.Details
		detailID = detail.ID.String()
		detailedDescription = detail.DetailedDescription
		goals = detail.Goals
		challenges = detail.Challenges
		solutions = detail.Solutions
		lessonsLearned = detail.LessonsLearned
		futureEnhancements = detail.FutureEnhancements
		license = l.GetLicenseText(detail.LicenseText)
		licenseText = detail.LicenseText
		version = detail.Version
		createdAt = detail.CreatedAt.Format("2006-01-02 15:04:05")
		updatedAt = detail.UpdatedAt.Format("2006-01-02 15:04:05")
	} else {
		// Use project info as fallback
		detailID = proj.ID.String()
		detailedDescription = proj.Description
		license = "MIT"
		version = "1.0.0"
		createdAt = proj.CreatedAt.Format("2006-01-02 15:04:05")
		updatedAt = proj.UpdatedAt.Format("2006-01-02 15:04:05")
	}

	return &types.ProjectDetail{
		ID:                  detailID,
		ProjectID:           proj.ID.String(),
		DetailedDescription: detailedDescription,
		Goals:               goals,
		Challenges:          challenges,
		Solutions:           solutions,
		LessonsLearned:      lessonsLearned,
		FutureEnhancements:  futureEnhancements,
		License:             license,
		LicenseText:         licenseText,
		Version:             version,
		Timeline:            timeline,
		Metrics:             metrics,
		RelatedBlogs:        []types.ProjectBlogRef{}, // This would need to be implemented
		CreatedAt:           createdAt,
		UpdatedAt:           updatedAt,
	}, nil
}
