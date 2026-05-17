package projects

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"silan-backend/internal/ent"
	entcomment "silan-backend/internal/ent/comment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type CreateProjectCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Create a comment for a project
func NewCreateProjectCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CreateProjectCommentLogic {
	return &CreateProjectCommentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *CreateProjectCommentLogic) CreateProjectComment(req *types.CreateProjectCommentRequest) (resp *types.ProjectCommentData, err error) {
	if strings.TrimSpace(req.Content) == "" {
		return nil, fmt.Errorf("content is required")
	}
	if _, err := uuid.Parse(req.ID); err != nil {
		return nil, fmt.Errorf("invalid project id")
	}

	// Validate parent comment if provided
	var parentUUID *uuid.UUID
	if req.ParentId != "" {
		parentIDParsed, err := uuid.Parse(req.ParentId)
		if err != nil {
			return nil, fmt.Errorf("invalid parent_id format")
		}
		// Ensure parent exists and belongs to same project using entgo
		parentComment, err := l.svcCtx.DB.Comment.Get(l.ctx, parentIDParsed)
		if err != nil {
			return nil, errors.New("parent comment not found")
		}
		if parentComment.EntityID.String() != req.ID {
			return nil, errors.New("parent comment belongs to different project")
		}
		parentUUID = &parentIDParsed
	}

	// Resolve author
	authorName := req.AuthorName
	authorEmail := req.AuthorEmail
	avatarURL := ""
	if req.UserIdentityId != "" && strings.TrimSpace(req.UserIdentityId) != "" {
		user, err := l.svcCtx.DB.UserIdentity.Get(l.ctx, req.UserIdentityId)
		if err != nil {
			return nil, fmt.Errorf("invalid user identity")
		}
		authorName = user.DisplayName
		authorEmail = user.Email
		avatarURL = user.AvatarURL
	} else {
		if authorName == "" {
			return nil, fmt.Errorf("author_name is required for anonymous comments")
		}
		if authorEmail == "" || !strings.Contains(authorEmail, "@") || len(authorEmail) < 5 {
			return nil, fmt.Errorf("author_email is required and must be valid")
		}
		// Try to get avatar from stored identities using entgo
		userIdentity, err := l.svcCtx.DB.UserIdentity.Query().
			Where(func(s *sql.Selector) {
				s.Where(sql.EQ("email", authorEmail))
			}).
			Order(ent.Desc("updated_at")).
			First(l.ctx)
		if err == nil && userIdentity.AvatarURL != "" {
			avatarURL = userIdentity.AvatarURL
		}
	}

	// Prepare user agent tagging with fingerprint
	userAgent := "fp:" + req.Fingerprint
	if req.UserAgentFull != "" {
		userAgent += " | " + req.UserAgentFull
	}

	// Parse project ID
	projectUUID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid project id")
	}

	// Create comment using entgo
	// Use entity_type with project_<type> for better filtering while keeping the type field
	entityType := "project_" + strings.ToLower(req.Type)
	commentBuilder := l.svcCtx.DB.Comment.Create().
		SetEntityType(entcomment.EntityType(entityType)).
		SetEntityID(projectUUID).
		SetType(entcomment.Type(req.Type)).
		SetAuthorName(authorName).
		SetAuthorEmail(authorEmail).
		SetContent(req.Content).
		SetIsApproved(true). // Auto-approve for now
		SetLikesCount(0)

	if parentUUID != nil {
		commentBuilder = commentBuilder.SetParentID(*parentUUID)
	}
	if req.AuthorWebsite != "" {
		commentBuilder = commentBuilder.SetAuthorWebsite(req.AuthorWebsite)
	}
	if req.ClientIP != "" {
		commentBuilder = commentBuilder.SetIPAddress(req.ClientIP)
	}
	if userAgent != "" {
		commentBuilder = commentBuilder.SetUserAgent(userAgent)
	}
	if req.UserIdentityId != "" {
		commentBuilder = commentBuilder.SetUserIdentityID(req.UserIdentityId)
	}

	comment, err := commentBuilder.Save(l.ctx)
	if err != nil {
		return nil, err
	}

	parentIDStr := ""
	if comment.ParentID != (uuid.UUID{}) {
		parentIDStr = comment.ParentID.String()
	}

	return &types.ProjectCommentData{
		ID:              comment.ID.String(),
		ProjectID:       comment.EntityID.String(),
		ParentID:        parentIDStr,
		AuthorName:      comment.AuthorName,
		AuthorAvatarURL: avatarURL,
		Content:         comment.Content,
		Type:            string(comment.Type),
		CreatedAt:       comment.CreatedAt.Format(time.RFC3339),
		UserIdentityID:  comment.UserIdentityID,
		LikesCount:      comment.LikesCount,
		IsLikedByUser:   false,
		Replies:         []types.ProjectCommentData{},
	}, nil
}
