package projects

import (
	"context"
	"time"

	"silan-backend/internal/ent/project"
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

	// Get client IP and user agent from context if available
	clientIP := req.ClientIP
	userAgent := req.UserAgentFull

	// Check if this is a duplicate view from the same user/fingerprint within the last hour
	// to prevent spam views and provide more accurate analytics
	oneHourAgo := time.Now().Add(-1 * time.Hour)

	var duplicateView bool
	if req.UserIdentityId != "" {
		// For authenticated users
		count, err := l.svcCtx.DB.ProjectView.Query().
			Where(projectview.ProjectID(projectID)).
			Where(projectview.UserIdentityID(req.UserIdentityId)).
			Where(projectview.CreatedAtGT(oneHourAgo)).
			Count(l.ctx)
		if err != nil {
			return nil, err
		}
		duplicateView = count > 0
	} else if req.Fingerprint != "" {
		// For anonymous users
		count, err := l.svcCtx.DB.ProjectView.Query().
			Where(projectview.ProjectID(projectID)).
			Where(projectview.Fingerprint(req.Fingerprint)).
			Where(projectview.CreatedAtGT(oneHourAgo)).
			Count(l.ctx)
		if err != nil {
			return nil, err
		}
		duplicateView = count > 0
	}

	var viewRecorded bool = false

	if !duplicateView {
		// Create view record
		builder := l.svcCtx.DB.ProjectView.Create().
			SetProjectID(projectID)

		if req.UserIdentityId != "" {
			builder = builder.SetUserIdentityID(req.UserIdentityId)
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

		_, err = builder.Save(l.ctx)
		if err != nil {
			return nil, err
		}

		err = analytics.RecordContentInteraction(l.ctx, l.svcCtx, analytics.InteractionEvent{
			EntityType:     "project",
			EntityID:       projectID,
			Kind:           "view",
			UserIdentityID: req.UserIdentityId,
			Fingerprint:    req.Fingerprint,
			IPAddress:      clientIP,
			UserAgent:      userAgent,
			Referrer:       req.Referrer,
		})
		if err != nil {
			return nil, err
		}

		// Increment view count
		err = l.svcCtx.DB.Project.Update().
			Where(project.ID(projectID)).
			AddViewCount(1).
			Exec(l.ctx)
		if err != nil {
			return nil, err
		}

		viewRecorded = true
	}

	// Get updated view count
	proj, err := l.svcCtx.DB.Project.Get(l.ctx, projectID)
	if err != nil {
		return nil, err
	}

	return &types.RecordProjectViewResponse{
		ViewsCount:   proj.ViewCount,
		ViewRecorded: viewRecorded,
	}, nil
}
