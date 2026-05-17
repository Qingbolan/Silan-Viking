package ideas

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetIdeaCategoriesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get idea categories
func NewGetIdeaCategoriesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetIdeaCategoriesLogic {
	return &GetIdeaCategoriesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetIdeaCategoriesLogic) GetIdeaCategories(req *types.IdeaCategoriesRequest) (resp []string, err error) {
	// Note: The current idea schema doesn't have categories as a separate entity
	// This would need to be implemented when the schema is updated to include
	// a proper category field or relationship

	// For now, return some default categories based on research fields
	categories := []string{
		"AI & Machine Learning",
		"Data Science",
		"Web Development",
		"Mobile Development",
		"Cloud Computing",
		"Cybersecurity",
		"IoT",
		"Blockchain",
		"Computer Vision",
		"Natural Language Processing",
		"Robotics",
		"Software Engineering",
		"Database Systems",
		"Distributed Systems",
		"Research & Development",
	}

	// In a real implementation, you would query the database for unique categories
	// For example:
	// categories, err := l.svcCtx.DB.Idea.Query().
	//     Select(idea.FieldCategory).
	//     Distinct().
	//     All(l.ctx)

	return categories, nil
}
