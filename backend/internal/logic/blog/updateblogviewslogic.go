package blog

import (
	"context"
	"time"

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
	if _, err := l.svcCtx.DB.BlogPost.Get(l.ctx, postID); err != nil {
		return err
	}

	tx, err := l.svcCtx.DB.Tx(l.ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	client := tx.Client()

	sessionDuration := 0
	if req.ReadingTime > 0 {
		sessionDuration = (req.ReadingTime + 999) / 1000
	}

	duplicateView := false
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	if req.AuthenticatedUserID != "" || req.Fingerprint != "" {
		query := client.ContentInteraction.Query().Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeBlog),
			contentinteraction.EntityIDEQ(postID),
			contentinteraction.KindEQ(contentinteraction.KindView),
			contentinteraction.CreatedAtGT(oneHourAgo),
		)
		if req.AuthenticatedUserID != "" && req.Fingerprint != "" {
			query = query.Where(contentinteraction.Or(
				contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID),
				contentinteraction.FingerprintEQ(req.Fingerprint),
			))
		} else if req.AuthenticatedUserID != "" {
			query = query.Where(contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID))
		} else {
			query = query.Where(contentinteraction.FingerprintEQ(req.Fingerprint))
		}
		count, err := query.Count(l.ctx)
		if err != nil {
			return err
		}
		duplicateView = count > 0
	}

	if duplicateView {
		return tx.Commit()
	}

	if err := analytics.RecordContentInteraction(l.ctx, client, l.svcCtx.Traffic, l.svcCtx.CountryResolver, analytics.InteractionEvent{
		EntityType:      "blog",
		EntityID:        postID,
		Kind:            "view",
		UserIdentityID:  req.AuthenticatedUserID,
		Fingerprint:     req.Fingerprint,
		IPAddress:       req.ClientIP,
		UserAgent:       req.UserAgentFull,
		Referrer:        req.Referrer,
		LandingURL:      req.LandingURL,
		SessionDuration: sessionDuration,
		ScrollProgress:  req.ScrollProgress,
	}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	l.Logger.Infof("View recorded for post %s", req.ID)

	return nil
}
