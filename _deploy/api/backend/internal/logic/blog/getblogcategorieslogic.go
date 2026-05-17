package blog

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogcategory"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogCategoriesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get blog categories
func NewGetBlogCategoriesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogCategoriesLogic {
	return &GetBlogCategoriesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetBlogCategoriesLogic) GetBlogCategories(req *types.BlogCategoriesRequest) (resp []types.BlogCategory, err error) {
	categories, err := l.svcCtx.DB.BlogCategory.Query().
		Order(ent.Asc(blogcategory.FieldName)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.BlogCategory
	for _, cat := range categories {
		result = append(result, types.BlogCategory{
			ID:          cat.ID.String(),
			Name:        cat.Name,
			Slug:        cat.Slug,
			Description: cat.Description,
			Color:       cat.Color,
			SortOrder:   cat.SortOrder,
		})
	}

	return result, nil
}
