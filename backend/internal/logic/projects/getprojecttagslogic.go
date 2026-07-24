package projects

import (
	"context"
	"sort"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectTagsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project technologies/tags
func NewGetProjectTagsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectTagsLogic {
	return &GetProjectTagsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectTagsLogic) GetProjectTags(req *types.ResumeRequest) (resp []string, err error) {
	projects, err := l.svcCtx.DB.Project.Query().
		Where(publicProject()).
		WithTechnologies().
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	tags := make(map[string]struct{})
	for _, proj := range projects {
		for _, tech := range proj.Edges.Technologies {
			if tech.TechnologyName != "" {
				tags[tech.TechnologyName] = struct{}{}
			}
		}
	}

	resp = make([]string, 0, len(tags))
	for tag := range tags {
		resp = append(resp, tag)
	}
	sort.Strings(resp)

	return resp, nil
}
