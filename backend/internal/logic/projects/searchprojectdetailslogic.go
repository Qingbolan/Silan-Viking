package projects

import (
	"context"
	"fmt"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/projectdetail"
	"silan-backend/internal/ent/projecttechnology"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type SearchProjectDetailsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Search project details with filters
func NewSearchProjectDetailsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SearchProjectDetailsLogic {
	return &SearchProjectDetailsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SearchProjectDetailsLogic) SearchProjectDetails(req *types.ProjectSearchRequest) (resp []types.ProjectDetail, err error) {
	// Build the query with filters - search through project details with project join
	// Only include public projects
	query := l.svcCtx.DB.ProjectDetail.Query().
		WithProject(func(q *ent.ProjectQuery) {
			q.WithTranslations()
		}).
		Where(projectdetail.HasProjectWith(project.VisibilityEQ(project.VisibilityPublic)))

	// Apply filters through project relationship if provided
	if req.Query != "" {
		query = query.Where(
			projectdetail.Or(
				// M0.5a §11.8: release_notes / quick_start moved to item_part
				projectdetail.DependenciesContains(req.Query),
				projectdetail.LicenseTextContains(req.Query),
				projectdetail.VersionContains(req.Query),
				projectdetail.HasProjectWith(
					project.Or(
						project.TitleContains(req.Query),
						project.DescriptionContains(req.Query),
					),
				),
			),
		)
	}

	if req.Tags != "" {
		query = query.Where(
			projectdetail.HasProjectWith(
				project.HasTechnologiesWith(
					projecttechnology.TechnologyNameContains(req.Tags),
				),
			),
		)
	}

	if req.Year > 0 {
		query = query.Where(
			projectdetail.HasProjectWith(
				project.CreatedAtGTE(time.Date(req.Year, 1, 1, 0, 0, 0, 0, time.UTC)),
				project.CreatedAtLTE(time.Date(req.Year, 12, 31, 23, 59, 59, 999999999, time.UTC)),
			),
		)
	}

	// Execute the query
	projectDetails, err := query.All(l.ctx)
	if err != nil {
		return nil, err
	}

	// Convert to response format
	result := make([]types.ProjectDetail, 0, len(projectDetails))
	for _, pd := range projectDetails {
		// Get timeline data from the related project
		timeline := types.ProjectTimeline{
			Start:    "",
			End:      "",
			Duration: "",
		}

		// Get metrics data from the related project
		metrics := types.ProjectMetrics{
			LinesOfCode: 0,
			Commits:     0,
			Stars:       0,
			Downloads:   0,
		}

		// If project is loaded, get additional data
		if pd.Edges.Project != nil {
			proj := pd.Edges.Project
			// Dates are plain strings from the silan-viking engine.
			timeline.Start = proj.StartDate
			timeline.End = proj.EndDate

			// Calculate duration if both dates parse as `YYYY-MM-DD`.
			start, startErr := time.Parse("2006-01-02", proj.StartDate)
			end, endErr := time.Parse("2006-01-02", proj.EndDate)
			if startErr == nil && endErr == nil {
				days := int(end.Sub(start).Hours() / 24)
				if days > 0 {
					timeline.Duration = fmt.Sprintf("%d days", days)
				}
			}

			metrics.Stars = proj.LikeCount
		}

		// Get values from project detail entity (these are strings, not pointers)
		dependencies := pd.Dependencies
		license := pd.License
		licenseText := pd.LicenseText
		version := pd.Version

		// Get detailed description from related project if available.
		// The content engine leaves description empty on the main projects
		// row, so resolve it from project_translations.
		var detailedDescription string
		if pd.Edges.Project != nil {
			detailedDescription = pd.Edges.Project.Description
			if tr := pickProjectTranslation(pd.Edges.Project.Edges.Translations, req.Language); tr != nil && tr.Description != "" {
				detailedDescription = tr.Description
			}
		}

		result = append(result, types.ProjectDetail{
			ID:                  pd.ID,
			ProjectID:           pd.ProjectID,
			DetailedDescription: detailedDescription,
			Release:             "", // M0.5a §11.8: moved to item_part
			QuickStart:          "", // M0.5a §11.8: moved to item_part
			Dependance:          dependencies,
			LicenseText:         licenseText,
			License:             license,
			Version:             version,
			Timeline:            timeline,
			Metrics:             metrics,
			RelatedBlogs:        []types.ProjectBlogRef{},
			CreatedAt:           pd.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:           pd.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}
