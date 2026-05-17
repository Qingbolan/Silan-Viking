package ideas

import (
	"context"
	"fmt"
	"strings"

	"silan-backend/internal/ent/idea"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type GetIdeaLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get single idea by ID
func NewGetIdeaLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetIdeaLogic {
	return &GetIdeaLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetIdeaLogic) GetIdea(req *types.IdeaRequest) (resp *types.IdeaData, err error) {
	// Parse UUID
	ideaID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid idea ID: %w", err)
	}

	// Query the idea with details
	ideaEntity, err := l.svcCtx.DB.Idea.Query().
		Where(idea.ID(ideaID)).
		WithUser().
		WithTags().
		WithDetails().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Convert to response format
	// Note: Author field not used in IdeaData response

	// Handle non-nullable fields
	abstract := ideaEntity.Abstract
	description := ideaEntity.Description

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
	var tags []string
	if len(ideaEntity.Edges.Tags) > 0 {
		for _, t := range ideaEntity.Edges.Tags {
			if t.Name != "" {
				tags = append(tags, t.Name)
			}
		}
	} else {
		tags = []string{}
	}
	// Category: now directly from Ent field
	category := ideaEntity.Category

	// Initialize empty slices and missing variables
	var techStack []string
	var keywords []string
	var collaborators []types.Collaborator
	var feedbackRequested []types.FeedbackType
	var publications []types.IdeaPublicationRef
	var conferences []string
	var codeRepository string
	var demoURL string

	return &types.IdeaData{
		ID:                   ideaEntity.ID.String(),
		Title:                ideaEntity.Title,
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
		CodeRepository:       codeRepository,
		DemoURL:              demoURL,
		TechStack:            techStack,
		Collaborators:        collaborators,
		OpenForCollaboration: collaborationNeeded,
		FeedbackRequested:    feedbackRequested,
		Publications:         publications,
		Conferences:          conferences,
		ResearchField:        category,
		Keywords:             keywords,
		EstimatedDuration:    estimatedDuration,
		FundingStatus:        requiredResources,
	}, nil
}
