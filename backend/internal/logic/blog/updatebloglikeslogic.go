package blog

import (
	"context"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/logic/analytics"
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

	existingLike := false
	likeQuery := l.svcCtx.DB.ContentInteraction.Query().
		Where(contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeBlog)).
		Where(contentinteraction.EntityIDEQ(postID)).
		Where(contentinteraction.KindEQ(contentinteraction.KindLike))
	if req.UserIdentityId != "" {
		likeQuery = likeQuery.Where(contentinteraction.UserIdentityIDEQ(req.UserIdentityId))
	} else if req.Fingerprint != "" {
		likeQuery = likeQuery.Where(contentinteraction.FingerprintEQ(req.Fingerprint))
	} else {
		likeQuery = nil
	}
	if likeQuery != nil {
		count, err := likeQuery.Count(l.ctx)
		if err != nil {
			return nil, err
		}
		existingLike = count > 0
	}

	if req.Increment {
		if !existingLike {
			err = analytics.RecordContentInteraction(l.ctx, l.svcCtx, analytics.InteractionEvent{
				EntityType:     "blog",
				EntityID:       postID,
				Kind:           "like",
				UserIdentityID: req.UserIdentityId,
				Fingerprint:    req.Fingerprint,
				IPAddress:      req.ClientIP,
				UserAgent:      req.UserAgentFull,
				Referrer:       req.Referrer,
			})
			if err != nil {
				return nil, err
			}
			err = l.svcCtx.DB.BlogPost.Update().
				Where(blogpost.ID(postID)).
				AddLikeCount(1).
				Exec(l.ctx)
		}
	} else {
		post, err := l.svcCtx.DB.BlogPost.Get(l.ctx, postID)
		if err != nil {
			return nil, err
		}
		if existingLike && post.LikeCount > 0 {
			deleteQuery := l.svcCtx.DB.ContentInteraction.Delete().
				Where(contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeBlog)).
				Where(contentinteraction.EntityIDEQ(postID)).
				Where(contentinteraction.KindEQ(contentinteraction.KindLike))
			if req.UserIdentityId != "" {
				deleteQuery = deleteQuery.Where(contentinteraction.UserIdentityIDEQ(req.UserIdentityId))
			} else if req.Fingerprint != "" {
				deleteQuery = deleteQuery.Where(contentinteraction.FingerprintEQ(req.Fingerprint))
			}
			_, err = deleteQuery.Exec(l.ctx)
			if err != nil {
				return nil, err
			}
			err = l.svcCtx.DB.BlogPost.Update().
				Where(blogpost.ID(postID)).
				AddLikeCount(-1).
				Exec(l.ctx)
		}
	}
	if err != nil {
		return nil, err
	}

	// Get updated like count
	post, err := l.svcCtx.DB.BlogPost.Get(l.ctx, postID)
	if err != nil {
		return nil, err
	}

	return &types.UpdateBlogLikesResponse{
		Likes: int64(post.LikeCount),
	}, nil
}
