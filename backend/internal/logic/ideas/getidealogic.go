package ideas

import (
	"context"
	"fmt"
	"strings"

	"silan-backend/internal/ent/idea"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
	ideaID := req.ID

	// Query the idea with details
	ideaEntity, err := l.svcCtx.DB.Idea.Query().
		Where(idea.ID(ideaID)).
		WithUser().
		WithTags().
		WithDetails().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	// Convert to response format
	// Note: Author field not used in IdeaData response

	// The content engine keeps title/abstract in idea_translations and the
	// prose bodies (overview/progress/result/reference) in item_part_translation,
	// leaving the main ideas row's title/abstract/description empty — so always
	// resolve title/abstract from the translation here.
	title := ideaEntity.Title
	abstract := ideaEntity.Abstract
	if tr := pickIdeaTranslation(ideaEntity.Edges.Translations, req.Language); tr != nil {
		if tr.Title != "" {
			title = tr.Title
		}
		if tr.Abstract != "" {
			abstract = tr.Abstract
		}
	}
	var abstractZh string
	if tr := pickIdeaTranslation(ideaEntity.Edges.Translations, "zh"); tr != nil {
		abstractZh = tr.Abstract
	}

	// Prose bodies come from the idea's item_part rows.
	// The IdeaData.Description carries the `overview` Part body.
	description := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "overview", req.Language)
	progress := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "progress", req.Language)
	progressZh := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "progress", "zh")
	results := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "result", req.Language)
	resultsZh := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "result", "zh")
	reference := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "reference", req.Language)
	referenceZh := ideaPartBody(l.ctx, l.svcCtx, ideaEntity.ID, "reference", "zh")

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
		ID:                   ideaEntity.ID,
		Title:                title,
		Description:          description,
		Category:             category,
		Tags:                 tags,
		Status:               strings.ToLower(string(ideaEntity.Status)),
		CreatedAt:            ideaEntity.CreatedAt.Format("2006-01-02T15:04:05Z"),
		LastUpdated:          ideaEntity.UpdatedAt.Format("2006-01-02T15:04:05Z"),
		Abstract:             abstract,
		AbstractZh:           abstractZh,
		Progress:             progress,
		ProgressZh:           progressZh,
		Results:              results,
		ResultsZh:            resultsZh,
		Reference:            reference,
		Reference_Zh:         referenceZh,
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
