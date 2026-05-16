package ideas

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetIdeaTagsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get idea tags
func NewGetIdeaTagsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetIdeaTagsLogic {
	return &GetIdeaTagsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetIdeaTagsLogic) GetIdeaTags(req *types.IdeaTagsRequest) (resp []string, err error) {
	// Note: The current idea schema doesn't have tags as a separate entity
	// This would need to be implemented when the schema is updated to include
	// a proper tag relationship or field

	// For now, return some default tags based on common technology and research areas
	tags := []string{
		"Machine Learning",
		"Deep Learning",
		"Neural Networks",
		"Computer Vision",
		"Natural Language Processing",
		"Data Science",
		"Big Data",
		"Cloud Computing",
		"Microservices",
		"API Development",
		"Frontend",
		"Backend",
		"Full Stack",
		"Mobile Development",
		"Web Development",
		"Database Design",
		"DevOps",
		"Cybersecurity",
		"Blockchain",
		"IoT",
		"Robotics",
		"Automation",
		"Performance Optimization",
		"Scalability",
		"Research",
		"Innovation",
		"Prototype",
		"MVP",
		"Open Source",
		"Collaboration",
		"Startup",
		"Enterprise",
		"Algorithm",
		"Data Structure",
		"Software Architecture",
		"System Design",
		"Testing",
		"CI/CD",
		"Monitoring",
		"Analytics",
	}

	// In a real implementation, you would query the database for unique tags
	// For example:
	// tags, err := l.svcCtx.DB.IdeaTag.Query().
	//     Select(ideatag.FieldName).
	//     Distinct().
	//     All(l.ctx)

	return tags, nil
}
