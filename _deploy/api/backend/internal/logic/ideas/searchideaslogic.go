package ideas

import (
	"context"
	"fmt"
	"math"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/idea"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type SearchIdeasLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Search ideas with filters
func NewSearchIdeasLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SearchIdeasLogic {
	return &SearchIdeasLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SearchIdeasLogic) SearchIdeas(req *types.IdeaSearchRequest) (resp *types.IdeaListResponse, err error) {
	query := l.svcCtx.DB.Idea.Query().
		Where(idea.IsPublic(true)).
		WithUser()

	// Apply search query if provided
	if req.Query != "" {
		query = query.Where(idea.Or(
			idea.TitleContains(req.Query),
			idea.AbstractContains(req.Query),
			idea.MotivationContains(req.Query),
			idea.MethodologyContains(req.Query),
			idea.ExpectedOutcomeContains(req.Query),
			idea.RequiredResourcesContains(req.Query),
		))
	}

	// Apply status filter
	if req.Status != "" {
		query = query.Where(idea.StatusEQ(idea.Status(req.Status)))
	}

	// Apply category filter
	// Note: This would work if categories were stored as a field in the idea table
	// For now, we'll skip this filter since the schema doesn't have a category field
	if req.Category != "" {
		// This would be implemented when the schema is updated:
		// query = query.Where(idea.CategoryContains(req.Category))
	}

	// Apply tags filter
	// Note: This would work if tags were stored as a field or relationship
	// For now, we'll skip this filter since the schema doesn't have tags
	if req.Tags != "" {
		// This would be implemented when the schema is updated:
		// tagList := strings.Split(req.Tags, ",")
		// for _, tag := range tagList {
		//     query = query.Where(idea.HasTagsWith(ideatag.NameContains(strings.TrimSpace(tag))))
		// }
	}

	// Get total count
	total, err := query.Count(l.ctx)
	if err != nil {
		return nil, err
	}

	// Apply pagination
	offset := (req.Page - 1) * req.Size
	ideas, err := query.
		Order(ent.Desc(idea.FieldUpdatedAt)).
		Limit(req.Size).
		Offset(offset).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.IdeaData
	for _, ideaEntity := range ideas {
		// Handle non-nullable fields
		abstract := ideaEntity.Abstract
		motivation := ideaEntity.Motivation
		methodology := ideaEntity.Methodology
		expectedOutcome := ideaEntity.ExpectedOutcome
		requiredResources := ideaEntity.RequiredResources

		var estimatedDuration string
		if ideaEntity.EstimatedDurationMonths > 0 {
			estimatedDuration = fmt.Sprintf("%d months", ideaEntity.EstimatedDurationMonths)
		}

		// For now, we'll use empty slices for tags and categories
		// These would need to be implemented when the schema is updated
		var tags []string
		var category string

		// Create empty slices for complex fields
		var futureDirections []string
		if futureDirections == nil {
			futureDirections = []string{}
		}

		var techStack []string
		if techStack == nil {
			techStack = []string{}
		}

		var keywords []string
		if keywords == nil {
			keywords = []string{}
		}

		var keyFindings []string
		if keyFindings == nil {
			keyFindings = []string{}
		}

		var limitations []string
		if limitations == nil {
			limitations = []string{}
		}

		var collaborators []types.Collaborator
		if collaborators == nil {
			collaborators = []types.Collaborator{}
		}

		var experiments []types.Experiment
		if experiments == nil {
			experiments = []types.Experiment{}
		}

		var relatedWorks []types.Reference
		if relatedWorks == nil {
			relatedWorks = []types.Reference{}
		}

		var citations []types.Reference
		if citations == nil {
			citations = []types.Reference{}
		}

		var feedbackRequested []types.FeedbackType
		if feedbackRequested == nil {
			feedbackRequested = []types.FeedbackType{}
		}

		var publications []types.IdeaPublicationRef
		if publications == nil {
			publications = []types.IdeaPublicationRef{}
		}

		var conferences []string
		if conferences == nil {
			conferences = []string{}
		}

		result = append(result, types.IdeaData{
			ID:                   ideaEntity.ID.String(),
			Title:                ideaEntity.Title,
			Description:          abstract,
			Category:             category,
			Tags:                 tags,
			Status:               string(ideaEntity.Status),
			CreatedAt:            ideaEntity.CreatedAt.Format("2006-01-02T15:04:05Z"),
			LastUpdated:          ideaEntity.UpdatedAt.Format("2006-01-02T15:04:05Z"),
			Abstract:             abstract,
			Motivation:           motivation,
			Methodology:          methodology,
			Experiments:          experiments,
			PreliminaryResults:   expectedOutcome,
			RelatedWorks:         relatedWorks,
			Citations:            citations,
			FutureDirections:     futureDirections,
			TechStack:            techStack,
			Collaborators:        collaborators,
			OpenForCollaboration: ideaEntity.CollaborationNeeded,
			FeedbackRequested:    feedbackRequested,
			Publications:         publications,
			Conferences:          conferences,
			KeyFindings:          keyFindings,
			Limitations:          limitations,
			Difficulty:           string(ideaEntity.Priority),
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
