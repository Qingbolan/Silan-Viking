package ideas

import (
	"context"
	"fmt"

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

	// Query the idea
	ideaEntity, err := l.svcCtx.DB.Idea.Query().
		Where(idea.ID(ideaID)).
		WithUser().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Convert to response format
	// Note: Author field not used in IdeaData response

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

	// Note: EstimatedBudget field not used in IdeaData response

	// For now, we'll use empty slices for tags and categories
	// These would need to be implemented when the schema is updated
	var tags []string
	if tags == nil {
		tags = []string{}
	}
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

	return &types.IdeaData{
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
	}, nil
}
