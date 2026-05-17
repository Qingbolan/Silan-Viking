package ideas

import (
	"context"
	"fmt"
	"math"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/idea"
	"silan-backend/internal/ent/ideadetail"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetIdeasLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get ideas list with pagination and filtering
func NewGetIdeasLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetIdeasLogic {
	return &GetIdeasLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetIdeasLogic) GetIdeas(req *types.IdeaListRequest) (resp *types.IdeaListResponse, err error) {
	query := l.svcCtx.DB.Idea.Query().
		Where(idea.VisibilityEQ(idea.VisibilityPublic)).
		WithUser()

	// Apply filters
	if req.Status != "" {
		query = query.Where(idea.StatusEQ(idea.Status(req.Status)))
	}

	if req.Collaboration {
		query = query.Where(idea.HasDetailsWith(ideadetail.CollaborationNeeded(true)))
	}

	if req.Funding != "" {
		if req.Funding == "required" {
			query = query.Where(idea.HasDetailsWith(ideadetail.FundingRequired(true)))
		} else if req.Funding == "not_required" {
			query = query.Where(idea.HasDetailsWith(ideadetail.FundingRequired(false)))
		}
	}

	if req.Search != "" {
		query = query.Where(idea.Or(
			idea.TitleContains(req.Search),
			idea.DescriptionContains(req.Search),
			idea.AbstractContains(req.Search),
		))
	}

	// Get total count
	total, err := query.Count(l.ctx)
	if err != nil {
		return nil, err
	}

	// Apply pagination
	offset := (req.Page - 1) * req.Size
	ideas, err := query.
		WithTags().
		WithDetails().
		WithTranslations().
		Order(ent.Desc(idea.FieldUpdatedAt)).
		Limit(req.Size).
		Offset(offset).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	// Category now comes directly from Ent field after schema sync

	var result []types.IdeaData
	for _, ideaEntity := range ideas {
		// Handle non-nullable fields
		abstract := ideaEntity.Abstract
		description := ideaEntity.Description
		title := ideaEntity.Title

		// Resolve language-variant fields from idea_translations: the content
		// engine leaves title/abstract empty on the main ideas row.
		if tr := pickIdeaTranslation(ideaEntity.Edges.Translations, req.Language); tr != nil {
			if tr.Title != "" {
				title = tr.Title
			}
			if tr.Abstract != "" {
				abstract = tr.Abstract
			}
		}

		// Get detail fields from IdeaDetail edge
		var requiredResources string
		var collaborationNeeded bool
		var estimatedDuration string

		if ideaEntity.Edges.Details != nil {
			detail := ideaEntity.Edges.Details
			requiredResources = detail.RequiredResources
			collaborationNeeded = detail.CollaborationNeeded

			if detail.EstimatedDurationMonths > 0 {
				estimatedDuration = fmt.Sprintf("%d months", detail.EstimatedDurationMonths)
			}
		}

		// Tags from M2M edge (IdeaTag)
		tags := []string{}
		if len(ideaEntity.Edges.Tags) > 0 {
			for _, t := range ideaEntity.Edges.Tags {
				if t.Name != "" {
					tags = append(tags, t.Name)
				}
			}
		}
		category := ideaEntity.Category

		// Initialize missing variables
		var codeRepository string
		var demoURL string
		var techStack []string
		var collaborators []types.Collaborator
		var feedbackRequested []types.FeedbackType
		var publications []types.IdeaPublicationRef
		var conferences []string
		var keywords []string

		result = append(result, types.IdeaData{
			ID:                   ideaEntity.ID,
			Title:                title,
			Description:          description,
			Category:             category,
			Tags:                 tags,
			Status:               strings.ToLower(string(ideaEntity.Status)),
			CreatedAt:            ideaEntity.CreatedAt.Format("2006-01-02T15:04:05Z"),
			LastUpdated:          ideaEntity.UpdatedAt.Format("2006-01-02T15:04:05Z"),
			Abstract:             abstract,
			AbstractZh:           abstract,
			Progress:             "", // M0.5a §11.8: moved to item_part
			ProgressZh:           "", // M0.5a §11.8: moved to item_part
			Results:              "", // M0.5a §11.8: moved to item_part
			ResultsZh:            "", // M0.5a §11.8: moved to item_part
			Reference:            "", // M0.5a §11.8: moved to item_part
			Reference_Zh:         "", // M0.5a §11.8: moved to item_part
			TechStack:            techStack,
			CodeRepository:       codeRepository,
			DemoURL:              demoURL,
			Collaborators:        collaborators,
			OpenForCollaboration: collaborationNeeded,
			FeedbackRequested:    feedbackRequested,
			Publications:         publications,
			Conferences:          conferences,
			ResearchField:        category,
			Keywords:             keywords,
			EstimatedDuration:    estimatedDuration,
			FundingStatus:        requiredResources,
		})
	}

	// Handle empty result
	if result == nil {
		result = []types.IdeaData{}
	}

	totalPages := int(math.Ceil(float64(total) / float64(req.Size)))

	return &types.IdeaListResponse{
		Ideas:      result,
		Total:      int64(total),
		Page:       req.Page,
		Size:       req.Size,
		TotalPages: totalPages,
	}, nil
}
