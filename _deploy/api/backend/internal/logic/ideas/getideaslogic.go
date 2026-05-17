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
		Where(idea.IsPublic(true)).
		WithUser()

	// Apply filters
	if req.Status != "" {
		query = query.Where(idea.StatusEQ(idea.Status(req.Status)))
	}

	if req.Difficulty != "" {
		query = query.Where(idea.PriorityEQ(idea.Priority(req.Difficulty)))
	}

	if req.Collaboration {
		query = query.Where(idea.CollaborationNeeded(true))
	}

	if req.Funding != "" {
		if req.Funding == "required" {
			query = query.Where(idea.FundingRequired(true))
		} else if req.Funding == "not_required" {
			query = query.Where(idea.FundingRequired(false))
		}
	}

	if req.Search != "" {
		query = query.Where(idea.Or(
			idea.TitleContains(req.Search),
			idea.AbstractContains(req.Search),
			idea.MotivationContains(req.Search),
			idea.MethodologyContains(req.Search),
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

		// Handle non-nullable fields
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
			PreliminaryResults:   expectedOutcome,
			OpenForCollaboration: ideaEntity.CollaborationNeeded,
			EstimatedDuration:    estimatedDuration,
			FundingStatus:        requiredResources,
			Difficulty:           string(ideaEntity.Priority),
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
