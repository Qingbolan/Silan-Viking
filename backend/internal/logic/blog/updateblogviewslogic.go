package blog

import (
	"context"
	"time"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateBlogViewsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Update blog post view count
func NewUpdateBlogViewsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateBlogViewsLogic {
	return &UpdateBlogViewsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateBlogViewsLogic) UpdateBlogViews(req *types.UpdateBlogViewsRequest) error {
	postID := req.ID

	sessionDuration := 0
	if req.ReadingTime > 0 {
		sessionDuration = (req.ReadingTime + 999) / 1000
	}

	duplicateView := false
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	if req.UserIdentityId != "" {
		count, err := l.svcCtx.DB.ContentInteraction.Query().
			Where(contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeBlog)).
			Where(contentinteraction.EntityIDEQ(postID)).
			Where(contentinteraction.KindEQ(contentinteraction.KindView)).
			Where(contentinteraction.UserIdentityIDEQ(req.UserIdentityId)).
			Where(contentinteraction.CreatedAtGT(oneHourAgo)).
			Count(l.ctx)
		if err != nil {
			return err
		}
		duplicateView = count > 0
	} else if req.Fingerprint != "" {
		count, err := l.svcCtx.DB.ContentInteraction.Query().
			Where(contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeBlog)).
			Where(contentinteraction.EntityIDEQ(postID)).
			Where(contentinteraction.KindEQ(contentinteraction.KindView)).
			Where(contentinteraction.FingerprintEQ(req.Fingerprint)).
			Where(contentinteraction.CreatedAtGT(oneHourAgo)).
			Count(l.ctx)
		if err != nil {
			return err
		}
		duplicateView = count > 0
	}

	err := analytics.RecordContentInteraction(l.ctx, l.svcCtx, analytics.InteractionEvent{
		EntityType:      "blog",
		EntityID:        postID,
		Kind:            "view",
		UserIdentityID:  req.UserIdentityId,
		Fingerprint:     req.Fingerprint,
		IPAddress:       req.ClientIP,
		UserAgent:       req.UserAgentFull,
		Referrer:        req.Referrer,
		SessionDuration: sessionDuration,
		ScrollProgress:  req.ScrollProgress,
	})
	if err != nil {
		return err
	}

	if !duplicateView {
		err = l.svcCtx.DB.BlogPost.Update().
			Where(blogpost.ID(postID)).
			AddViewCount(1).
			Exec(l.ctx)
		if err != nil {
			return err
		}
	}

	l.Logger.Infof("View recorded for post %s", req.ID)

	return nil
}
