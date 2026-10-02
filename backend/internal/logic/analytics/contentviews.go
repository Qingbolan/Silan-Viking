package analytics

import (
	"context"
	"time"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// ContentViewsRecorder owns browser view deduplication across content kinds.
type ContentViewsRecorder struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewContentViewsRecorder(ctx context.Context, svcCtx *svc.ServiceContext) *ContentViewsRecorder {
	return &ContentViewsRecorder{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *ContentViewsRecorder) Record(req *types.UpdateBlogViewsRequest, entityType contentinteraction.EntityType) error {
	entityID := req.ID
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
			contentinteraction.EntityTypeEQ(entityType),
			contentinteraction.EntityIDEQ(entityID),
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

	if err := RecordContentInteraction(l.ctx, client, l.svcCtx.Traffic, l.svcCtx.CountryResolver, InteractionEvent{
		EntityType:      string(entityType),
		EntityID:        entityID,
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

	l.Logger.Infof("View recorded for %s %s", entityType, req.ID)

	return nil
}
