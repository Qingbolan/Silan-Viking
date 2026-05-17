package projects

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/projectlike"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
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
	// Parse project UUID
	projectID, err := uuid.Parse(req.ProjectID)
	if err != nil {
		return nil, err
	}

	// Get client IP and user agent from context if available
	clientIP := req.ClientIP
	userAgent := req.UserAgentFull

	// Check if user already liked this project
	var existingLike *ent.ProjectLike

	if req.UserIdentityId != "" {
		// For authenticated users
		existingLike, err = l.svcCtx.DB.ProjectLike.Query().
			Where(projectlike.ProjectID(projectID)).
			Where(projectlike.UserIdentityID(req.UserIdentityId)).
			Only(l.ctx)
		if err != nil && !ent.IsNotFound(err) {
			return nil, err
		}
	} else if req.Fingerprint != "" {
		// For anonymous users
		existingLike, err = l.svcCtx.DB.ProjectLike.Query().
			Where(projectlike.ProjectID(projectID)).
			Where(projectlike.Fingerprint(req.Fingerprint)).
			Only(l.ctx)
		if err != nil && !ent.IsNotFound(err) {
			return nil, err
		}
	}

	isLiked := existingLike != nil
	var likesCount int

	if isLiked {
		// Unlike: remove like record and decrement counter
		err = l.svcCtx.DB.ProjectLike.DeleteOne(existingLike).Exec(l.ctx)
		if err != nil {
			return nil, err
		}

		// Decrement like count
		err = l.svcCtx.DB.Project.Update().
			Where(project.ID(projectID)).
			AddLikeCount(-1).
			Exec(l.ctx)
		if err != nil {
			return nil, err
		}
	} else {
		// Like: create like record and increment counter
		builder := l.svcCtx.DB.ProjectLike.Create().
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

		_, err = builder.Save(l.ctx)
		if err != nil {
			return nil, err
		}

		err = analytics.RecordContentInteraction(l.ctx, l.svcCtx, analytics.InteractionEvent{
			EntityType:     "project",
			EntityID:       projectID,
			Kind:           "like",
			UserIdentityID: req.UserIdentityId,
			Fingerprint:    req.Fingerprint,
			IPAddress:      clientIP,
			UserAgent:      userAgent,
			Referrer:       req.Referrer,
		})
		if err != nil {
			return nil, err
		}

		// Increment like count
		err = l.svcCtx.DB.Project.Update().
			Where(project.ID(projectID)).
			AddLikeCount(1).
			Exec(l.ctx)
		if err != nil {
			return nil, err
		}
	}

	// Get updated like count
	proj, err := l.svcCtx.DB.Project.Get(l.ctx, projectID)
	if err != nil {
		return nil, err
	}

	likesCount = proj.LikeCount

	return &types.LikeProjectResponse{
		LikesCount:    likesCount,
		IsLikedByUser: !isLiked, // Toggle the state
	}, nil
}
