package projects

import (
	"context"
	"time"

	"silan-backend/internal/ent/projectview"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type RecordProjectViewLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Record project view
func NewRecordProjectViewLogic(ctx context.Context, svcCtx *svc.ServiceContext) *RecordProjectViewLogic {
	return &RecordProjectViewLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *RecordProjectViewLogic) RecordProjectView(req *types.RecordProjectViewRequest) (resp *types.RecordProjectViewResponse, err error) {
	projectID := req.ProjectID
	if _, err := l.svcCtx.DB.Project.Get(l.ctx, projectID); err != nil {
		return nil, err
	}

	tx, err := l.svcCtx.DB.Tx(l.ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	client := tx.Client()

	// Get client IP and user agent from context if available
	clientIP := req.ClientIP
	userAgent := req.UserAgentFull

	// Check if this is a duplicate view from the same user/fingerprint within the last hour
	// to prevent spam views and provide more accurate analytics
	oneHourAgo := time.Now().Add(-1 * time.Hour)

	var duplicateView bool
	if req.AuthenticatedUserID != "" || req.Fingerprint != "" {
		query := client.ProjectView.Query().
			Where(projectview.ProjectID(projectID), projectview.CreatedAtGT(oneHourAgo))
		if req.AuthenticatedUserID != "" && req.Fingerprint != "" {
			query = query.Where(projectview.Or(
				projectview.UserIdentityID(req.AuthenticatedUserID),
				projectview.Fingerprint(req.Fingerprint),
			))
		} else if req.AuthenticatedUserID != "" {
			query = query.Where(projectview.UserIdentityID(req.AuthenticatedUserID))
		} else {
			query = query.Where(projectview.Fingerprint(req.Fingerprint))
		}
		count, err := query.
			Count(l.ctx)
		if err != nil {
			return nil, err
		}
		duplicateView = count > 0
	}

	var viewRecorded bool = false

	if !duplicateView {
		// Create view record
		builder := client.ProjectView.Create().
			SetProjectID(projectID)

		if req.AuthenticatedUserID != "" {
			builder = builder.SetUserIdentityID(req.AuthenticatedUserID)
		}
		if req.Fingerprint != "" {
			builder = builder.SetFingerprint(req.Fingerprint)
		}
		if clientIP != "" {
			builder = builder.SetIPAddress(clientIP)
		}
		if userAgent != "" {
			builder = builder.SetUserAgent(userAgent)
		}
		if req.Referrer != "" {
			builder = builder.SetReferrer(req.Referrer)
		}

		if _, err := builder.Save(l.ctx); err != nil {
			return nil, err
		}

		if err := analytics.RecordContentInteraction(l.ctx, client, analytics.InteractionEvent{
			EntityType:     "project",
			EntityID:       projectID,
			Kind:           "view",
			UserIdentityID: req.AuthenticatedUserID,
			Fingerprint:    req.Fingerprint,
			IPAddress:      clientIP,
			UserAgent:      userAgent,
			Referrer:       req.Referrer,
		}); err != nil {
			return nil, err
		}

		viewRecorded = true
	}

	viewsCount, err := client.ProjectView.Query().
		Where(projectview.ProjectID(projectID)).
		Count(l.ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &types.RecordProjectViewResponse{
		ViewsCount:   viewsCount,
		ViewRecorded: viewRecorded,
	}, nil
}
