package projects

import (
	"context"
	"strings"

	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/logic/contentpart"
	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
	str = strings.TrimSpace(str)
	if str == "" {
		return ""
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
	projectUUID := req.ID

	// Fetch project with all related data including details
	proj, err := l.svcCtx.DB.Project.Query().
		Where(project.ID(projectUUID), publicProject()).
		WithTechnologies().
		WithDetails().
		WithImages().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Get basic project information
	// Dates are stored as plain strings by the silan-viking engine.
	startDate := proj.StartDate
	endDate := proj.EndDate

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
	counts, err := engagement.ProjectCount(l.ctx, l.svcCtx.DB, proj.ID)
	if err != nil {
		return nil, err
	}
	metrics.Stars = counts.Likes
	metrics.Downloads = 0

	// Create detail information
	var detailID string
	var detailedDescription, dependencies, license, version string
	var licenseText string
	var createdAt, updatedAt string
	if proj.Edges.Details != nil {
		detail := proj.Edges.Details
		detailID = detail.ID
		dependencies = detail.Dependencies
		license = strings.TrimSpace(detail.License)
		if license == "" {
			license = l.GetLicenseText(detail.LicenseText)
		}
		licenseText = detail.LicenseText
		version = detail.Version
		createdAt = formatContentTime(detail.CreatedAt, "2006-01-02 15:04:05")
		updatedAt = formatContentTime(detail.UpdatedAt, "2006-01-02 15:04:05")
	} else {
		// Absence remains absence. The API must not invent a license or release.
		detailID = proj.ID
		createdAt = formatContentTime(proj.CreatedAt, "2006-01-02 15:04:05")
		updatedAt = formatContentTime(proj.UpdatedAt, "2006-01-02 15:04:05")
	}

	// A project's prose lives in `item_part` Parts — one per role the
	// silan-viking SCHEMA declares for `project`. Each is read from
	// item_part_translation; an absent Part yields "" and the frontend
	// simply does not render that tab.
	detailedDescription = projectPartBody(l.ctx, l.svcCtx, proj.ID, "overview", req.Language)
	goals := projectPartBody(l.ctx, l.svcCtx, proj.ID, "goals", req.Language)
	challenges := projectPartBody(l.ctx, l.svcCtx, proj.ID, "challenges", req.Language)
	solutions := projectPartBody(l.ctx, l.svcCtx, proj.ID, "solutions", req.Language)
	lessons := projectPartBody(l.ctx, l.svcCtx, proj.ID, "lessons", req.Language)
	quickStart := projectPartBody(l.ctx, l.svcCtx, proj.ID, "quick_start", req.Language)
	releaseNotes := projectPartBody(l.ctx, l.svcCtx, proj.ID, "release_notes", req.Language)

	relatedBlogs, err := NewGetProjectRelatedBlogsLogic(l.ctx, l.svcCtx).GetProjectRelatedBlogs(req)
	if err != nil {
		return nil, err
	}

	// The data-driven Part list — whatever Parts the project actually has,
	// in sort_order. The named fields above stay as a compatibility shim;
	// the frontend renders tabs from `Parts`, so a project Part with a role
	// the SCHEMA never declared still becomes its own tab.
	parts, err := contentpart.Collect(l.ctx, l.svcCtx.DB, itempart.EntityTypeProject, proj.ID, req.Language)
	if err != nil {
		return nil, err
	}

	return &types.ProjectDetail{
		ID:                  detailID,
		ProjectID:           proj.ID,
		DetailedDescription: detailedDescription,
		Goals:               goals,
		Challenges:          challenges,
		Solutions:           solutions,
		Lessons:             lessons,
		Release:             releaseNotes,
		QuickStart:          quickStart,
		Dependance:          dependencies,
		License:             license,
		LicenseText:         licenseText,
		Version:             version,
		Timeline:            timeline,
		Metrics:             metrics,
		RelatedBlogs:        relatedBlogs,
		CreatedAt:           createdAt,
		UpdatedAt:           updatedAt,
		Parts:               parts,
	}, nil
}
