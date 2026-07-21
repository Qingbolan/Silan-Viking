package blog

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type CreateBlogCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Create a comment for a blog post
func NewCreateBlogCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CreateBlogCommentLogic {
	return &CreateBlogCommentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *CreateBlogCommentLogic) CreateBlogComment(req *types.CreateBlogCommentRequest) (resp *types.BlogCommentData, err error) {
	if req.Content == "" {
		return nil, fmt.Errorf("content is required")
	}

	postID := req.ID

	// Validate parent comment if this is a reply
	var parentID string
	if req.ParentId != "" {
		// Check if parent comment exists and belongs to the same post
		parentComment, err := l.svcCtx.DB.Comment.Get(l.ctx, req.ParentId)
		if err != nil {
			return nil, fmt.Errorf("parent comment not found")
		}
		if parentComment.EntityID != postID {
			return nil, fmt.Errorf("parent comment belongs to different post")
		}

		parentID = req.ParentId
	}

	// Handle authentication
	var userIdentity *ent.UserIdentity
	var authorName, authorEmail, avatarURL, authProvider string

	if req.AuthenticatedUserID != "" && strings.TrimSpace(req.AuthenticatedUserID) != "" {
		userIdentity, err = l.svcCtx.DB.UserIdentity.Get(l.ctx, req.AuthenticatedUserID)
		if err != nil {
			return nil, fmt.Errorf("invalid user identity")
		}
		authorName = userIdentity.DisplayName
		authorEmail = userIdentity.Email
		avatarURL = userIdentity.AvatarURL
		authProvider = userIdentity.Provider
	} else {
		// Anonymous user - require name and email
		if req.AuthorName == "" {
			return nil, fmt.Errorf("author_name is required for anonymous comments")
		}
		if req.AuthorEmail == "" {
			return nil, fmt.Errorf("author_email is required for anonymous comments")
		}
		if !strings.Contains(req.AuthorEmail, "@") || len(req.AuthorEmail) < 5 {
			return nil, fmt.Errorf("author_email format is invalid")
		}
		authorName = req.AuthorName
		authorEmail = req.AuthorEmail
		// Try to get avatar from existing user identities
		avatarURL = l.lookupAvatarByEmail(req.AuthorEmail)
	}

	// Prepare user agent string with fingerprint and browser info
	userAgent := "fp:" + req.Fingerprint
	if req.UserAgentFull != "" {
		userAgent += " | " + req.UserAgentFull
	}

	// Create comment
	createBuilder := l.svcCtx.DB.Comment.Create().
		SetEntityType("blog").
		SetEntityID(postID).
		SetAuthorName(authorName).
		SetAuthorEmail(authorEmail).
		SetContent(req.Content).
		SetIsApproved(true).
		SetUserAgent(userAgent)

	// Set IP address if provided
	if req.ClientIP != "" {
		createBuilder = createBuilder.SetIPAddress(req.ClientIP)
	}

	if parentID != "" {
		createBuilder = createBuilder.SetParentID(parentID)
	}

	if userIdentity != nil {
		createBuilder = createBuilder.SetUserIdentityID(userIdentity.ID)
	}

	countryCode := strings.ToUpper(req.CountryCode)
	if countryCode != "" {
		createBuilder = createBuilder.SetCountryCode(countryCode)
	}

	c, err := createBuilder.Save(l.ctx)
	if err != nil {
		return nil, err
	}

	// Log the comment creation for audit trail
	commentType := "root"
	if parentID != "" {
		commentType = "reply"
	}
	userType := "anonymous"
	if userIdentity != nil {
		userType = "authenticated"
	}

	l.Infof("Created %s comment %s by %s user (author: %s, ip: %s, fingerprint: %s)",
		commentType, c.ID, userType, authorName, req.ClientIP, req.Fingerprint)

	return &types.BlogCommentData{
		ID:              c.ID,
		BlogPostID:      c.EntityID,
		ParentID:        parentID,
		AuthorName:      c.AuthorName,
		AuthorAvatarURL: avatarURL,
		AuthProvider:    authProvider,
		CountryCode:     countryCode,
		Content:         c.Content,
		CreatedAt:       c.CreatedAt.Format(time.RFC3339),
		CanDelete:       true,
		Replies:         []types.BlogCommentData{},
	}, nil
}

func (l *CreateBlogCommentLogic) lookupAvatarByEmail(email string) string {
	var avatar sql.NullString
	drv := l.svcCtx.Config.Database.Driver
	if drv == "postgres" || drv == "postgresql" {
		_ = l.svcCtx.RawDB.QueryRowContext(l.ctx,
			"SELECT avatar_url FROM user_identities WHERE email = $1 ORDER BY updated_at DESC LIMIT 1",
			email,
		).Scan(&avatar)
	} else {
		_ = l.svcCtx.RawDB.QueryRowContext(l.ctx,
			"SELECT avatar_url FROM user_identities WHERE email = ? ORDER BY updated_at DESC LIMIT 1",
			email,
		).Scan(&avatar)
	}
	if avatar.Valid {
		return avatar.String
	}
	return ""
}
