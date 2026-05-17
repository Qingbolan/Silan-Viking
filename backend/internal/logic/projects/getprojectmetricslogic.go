package projects

import (
	"context"

	"silan-backend/internal/ent/projectlike"
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
	proj, err := l.svcCtx.DB.Project.Get(l.ctx, projectID)
	if err != nil {
		return nil, err
	}

	// Check if user has liked this project
	var isLikedByUser bool = false

	if req.UserIdentityId != "" {
		// For authenticated users
		likeCount, err := l.svcCtx.DB.ProjectLike.Query().
			Where(projectlike.ProjectID(projectID)).
			Where(projectlike.UserIdentityID(req.UserIdentityId)).
			Count(l.ctx)
		if err != nil {
			return nil, err
		}
		isLikedByUser = likeCount > 0
	} else if req.Fingerprint != "" {
		// For anonymous users
		likeCount, err := l.svcCtx.DB.ProjectLike.Query().
			Where(projectlike.ProjectID(projectID)).
			Where(projectlike.Fingerprint(req.Fingerprint)).
			Count(l.ctx)
		if err != nil {
			return nil, err
		}
		isLikedByUser = likeCount > 0
	}

	return &types.ProjectMetricsResponse{
		LikesCount:    proj.LikeCount,
		ViewsCount:    proj.ViewCount,
		IsLikedByUser: isLikedByUser,
	}, nil
}
