package projects

import (
	"context"

	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectMetricsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project metrics (likes, views)
func NewGetProjectMetricsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectMetricsLogic {
	return &GetProjectMetricsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectMetricsLogic) GetProjectMetrics(req *types.ProjectMetricsRequest) (resp *types.ProjectMetricsResponse, err error) {
	projectID := req.ProjectID

	// Get project with metrics
	_, err = l.svcCtx.DB.Project.Get(l.ctx, projectID)
	if err != nil {
		return nil, err
	}

	counts, err := engagement.ProjectCount(l.ctx, l.svcCtx.DB, projectID)
	if err != nil {
		return nil, err
	}
	isLikedByUser, err := engagement.IsProjectLiked(
		l.ctx,
		l.svcCtx.DB,
		projectID,
		req.AuthenticatedUserID,
		req.Fingerprint,
	)
	if err != nil {
		return nil, err
	}

	return &types.ProjectMetricsResponse{
		LikesCount:    counts.Likes,
		ViewsCount:    counts.Views,
		IsLikedByUser: isLikedByUser,
	}, nil
}
