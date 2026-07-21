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
	if req.ID == "" {
		return nil, fmt.Errorf("invalid project id")
	}

	// Validate parent comment if provided
	var parentID string
	if req.ParentId != "" {
		// Ensure parent exists and belongs to same project using entgo
		parentComment, err := l.svcCtx.DB.Comment.Get(l.ctx, req.ParentId)
		if err != nil {
			return nil, errors.New("parent comment not found")
		}
		if parentComment.EntityID != req.ID {
			return nil, errors.New("parent comment belongs to different project")
		}
		parentID = req.ParentId
	}

	// Resolve author
	authorName := req.AuthorName
	authorEmail := req.AuthorEmail
	avatarURL := ""
	authProvider := ""
	if req.AuthenticatedUserID != "" && strings.TrimSpace(req.AuthenticatedUserID) != "" {
		user, err := l.svcCtx.DB.UserIdentity.Get(l.ctx, req.AuthenticatedUserID)
		if err != nil {
			return nil, fmt.Errorf("invalid user identity")
		}
		authorName = user.DisplayName
		authorEmail = user.Email
		avatarURL = user.AvatarURL
		authProvider = user.Provider
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

	// entity_type identifies the owning content model; the independent type
	// column identifies general/question/feedback. Combining both values
	// (for example "project_general") violates the ent enum and makes every
	// create fail at validation time.
	commentBuilder := l.svcCtx.DB.Comment.Create().
		SetEntityType(entcomment.EntityTypeProject).
		SetEntityID(req.ID).
		SetType(entcomment.Type(req.Type)).
		SetAuthorName(authorName).
		SetAuthorEmail(authorEmail).
		SetContent(req.Content).
		SetIsApproved(true). // Auto-approve for now
		SetLikesCount(0)

	if parentID != "" {
		commentBuilder = commentBuilder.SetParentID(parentID)
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
	if req.AuthenticatedUserID != "" {
		commentBuilder = commentBuilder.SetUserIdentityID(req.AuthenticatedUserID)
	}

	countryCode := strings.ToUpper(req.CountryCode)
	if countryCode != "" {
		commentBuilder = commentBuilder.SetCountryCode(countryCode)
	}

	comment, err := commentBuilder.Save(l.ctx)
	if err != nil {
		return nil, err
	}

	return &types.ProjectCommentData{
		ID:              comment.ID,
		ProjectID:       comment.EntityID,
		ParentID:        comment.ParentID,
		AuthorName:      comment.AuthorName,
		AuthorAvatarURL: avatarURL,
		AuthProvider:    authProvider,
		CountryCode:     countryCode,
		Content:         comment.Content,
		Type:            string(comment.Type),
		CreatedAt:       comment.CreatedAt.Format(time.RFC3339),
		CanDelete:       true,
		LikesCount:      comment.LikesCount,
		IsLikedByUser:   false,
		Replies:         []types.ProjectCommentData{},
	}, nil
}
