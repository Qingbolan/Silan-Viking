package projects

import (
	"context"
	"fmt"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/projectlike"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type LikeProjectLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Like/Unlike a project
func NewLikeProjectLogic(ctx context.Context, svcCtx *svc.ServiceContext) *LikeProjectLogic {
	return &LikeProjectLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *LikeProjectLogic) LikeProject(req *types.LikeProjectRequest) (resp *types.LikeProjectResponse, err error) {
	projectID := req.ProjectID
	if req.AuthenticatedUserID == "" && req.Fingerprint == "" {
		return nil, fmt.Errorf("fingerprint or user_identity_id is required")
	}
	if _, err := l.svcCtx.DB.Project.Get(l.ctx, projectID); err != nil {
		return nil, err
	}

	tx, err := l.svcCtx.DB.Tx(l.ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	client := tx.Client()

	clientIP := req.ClientIP
	userAgent := req.UserAgentFull

	actorPredicate := projectlike.Fingerprint(req.Fingerprint)
	if req.AuthenticatedUserID != "" && req.Fingerprint != "" {
		actorPredicate = projectlike.Or(
			projectlike.UserIdentityID(req.AuthenticatedUserID),
			projectlike.Fingerprint(req.Fingerprint),
		)
	} else if req.AuthenticatedUserID != "" {
		actorPredicate = projectlike.UserIdentityID(req.AuthenticatedUserID)
	}
	existingLike, err := client.ProjectLike.Query().
		Where(projectlike.ProjectID(projectID), actorPredicate).
		First(l.ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}

	isLiked := existingLike != nil

	if isLiked {
		if err := client.ProjectLike.DeleteOne(existingLike).Exec(l.ctx); err != nil {
			return nil, err
		}
		deleteInteraction := client.ContentInteraction.Delete().Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeProject),
			contentinteraction.EntityIDEQ(projectID),
			contentinteraction.KindEQ(contentinteraction.KindLike),
		)
		if req.AuthenticatedUserID != "" && req.Fingerprint != "" {
			deleteInteraction = deleteInteraction.Where(contentinteraction.Or(
				contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID),
				contentinteraction.FingerprintEQ(req.Fingerprint),
			))
		} else if req.AuthenticatedUserID != "" {
			deleteInteraction = deleteInteraction.Where(contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID))
		} else {
			deleteInteraction = deleteInteraction.Where(contentinteraction.FingerprintEQ(req.Fingerprint))
		}
		if _, err := deleteInteraction.Exec(l.ctx); err != nil {
			return nil, err
		}
	} else {
		builder := client.ProjectLike.Create().
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

		if _, err := builder.Save(l.ctx); err != nil {
			return nil, err
		}

		if err := analytics.RecordContentInteraction(l.ctx, client, l.svcCtx.Traffic, l.svcCtx.CountryResolver, analytics.InteractionEvent{
			EntityType:     "project",
			EntityID:       projectID,
			Kind:           "like",
			UserIdentityID: req.AuthenticatedUserID,
			Fingerprint:    req.Fingerprint,
			IPAddress:      clientIP,
			UserAgent:      userAgent,
			Referrer:       req.Referrer,
		}); err != nil {
			return nil, err
		}
	}

	likesCount, err := client.ProjectLike.Query().
		Where(projectlike.ProjectID(projectID)).
		Count(l.ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &types.LikeProjectResponse{
		LikesCount:    likesCount,
		IsLikedByUser: !isLiked,
	}, nil
}
