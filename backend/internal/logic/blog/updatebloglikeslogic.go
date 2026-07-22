package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
	if _, err := l.svcCtx.DB.BlogPost.Get(l.ctx, req.ID); err != nil {
		return nil, err
	}
	return l.UpdateContentLikes(req, contentinteraction.EntityTypeBlog)
}

func (l *UpdateBlogLikesLogic) UpdateContentLikes(req *types.UpdateBlogLikesRequest, entityType contentinteraction.EntityType) (resp *types.UpdateBlogLikesResponse, err error) {
	postID := req.ID
	if req.AuthenticatedUserID == "" && req.Fingerprint == "" {
		return nil, fmt.Errorf("fingerprint or user_identity_id is required")
	}

	tx, err := l.svcCtx.DB.Tx(l.ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	client := tx.Client()

	var existingLike bool
	if entityType == contentinteraction.EntityTypeBlog {
		existingLike, err = engagement.IsBlogLiked(
			l.ctx,
			client,
			postID,
			req.AuthenticatedUserID,
			req.Fingerprint,
		)
	} else {
		existingLike, err = engagement.IsContentLiked(
			l.ctx,
			client,
			entityType,
			postID,
			req.AuthenticatedUserID,
			req.Fingerprint,
		)
	}
	if err != nil {
		return nil, err
	}

	if req.Increment {
		if !existingLike {
			if err := analytics.RecordContentInteraction(l.ctx, client, l.svcCtx.Traffic, l.svcCtx.CountryResolver, analytics.InteractionEvent{
				EntityType:     string(entityType),
				EntityID:       postID,
				Kind:           "like",
				UserIdentityID: req.AuthenticatedUserID,
				Fingerprint:    req.Fingerprint,
				IPAddress:      req.ClientIP,
				UserAgent:      req.UserAgentFull,
				Referrer:       req.Referrer,
			}); err != nil {
				return nil, err
			}
		}
	} else if existingLike {
		deleteQuery := client.ContentInteraction.Delete().
			Where(contentinteraction.EntityTypeEQ(entityType)).
			Where(contentinteraction.EntityIDEQ(postID)).
			Where(contentinteraction.KindEQ(contentinteraction.KindLike))
		if req.AuthenticatedUserID != "" && req.Fingerprint != "" {
			deleteQuery = deleteQuery.Where(contentinteraction.Or(
				contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID),
				contentinteraction.FingerprintEQ(req.Fingerprint),
			))
		} else if req.AuthenticatedUserID != "" {
			deleteQuery = deleteQuery.Where(contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID))
		} else {
			deleteQuery = deleteQuery.Where(contentinteraction.FingerprintEQ(req.Fingerprint))
		}
		if _, err := deleteQuery.Exec(l.ctx); err != nil {
			return nil, err
		}
	}

	counts, err := engagement.ContentCount(l.ctx, client, entityType, postID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &types.UpdateBlogLikesResponse{
		Likes:         int64(counts.Likes),
		IsLikedByUser: req.Increment,
	}, nil
}
