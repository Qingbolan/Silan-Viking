package blog

import (
	"context"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateBlogLikesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Update blog post like count
func NewUpdateBlogLikesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateBlogLikesLogic {
	return &UpdateBlogLikesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateBlogLikesLogic) UpdateBlogLikes(req *types.UpdateBlogLikesRequest) (resp *types.UpdateBlogLikesResponse, err error) {
	// Parse UUID
	postID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, err
	}

	// Update like count
	var newLikeCount int
	if req.Increment {
		err = l.svcCtx.DB.BlogPost.Update().
			Where(blogpost.ID(postID)).
			AddLikeCount(1).
			Exec(l.ctx)
	} else {
		err = l.svcCtx.DB.BlogPost.Update().
			Where(blogpost.ID(postID)).
			AddLikeCount(-1).
			Exec(l.ctx)
	}
	if err != nil {
		return nil, err
	}

	// Get updated like count
	post, err := l.svcCtx.DB.BlogPost.Get(l.ctx, postID)
	if err != nil {
		return nil, err
	}

	newLikeCount = post.LikeCount

	return &types.UpdateBlogLikesResponse{
		Likes: int64(newLikeCount),
	}, nil
}
