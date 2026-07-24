package blog

import (
	"context"
	"fmt"
	"strings"
	"time"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent/comment"
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
	return l.CreateComment(req, comment.EntityTypeBlog)
}

func (l *CreateBlogCommentLogic) CreateComment(req *types.CreateBlogCommentRequest, entityType comment.EntityType) (resp *types.BlogCommentData, err error) {
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
		if parentComment.EntityType != entityType {
			return nil, fmt.Errorf("parent comment belongs to different content type")
		}

		parentID = req.ParentId
	}

	author, err := commentruntime.ResolveAuthor(
		l.ctx,
		l.svcCtx.DB,
		req.AuthenticatedUserID,
		req.AuthorName,
		req.Fingerprint,
		req.CountryCode,
		req.RegionCode,
	)
	if err != nil {
		return nil, err
	}

	// Prepare user agent string with fingerprint and browser info
	userAgent := "fp:" + req.Fingerprint
	if req.UserAgentFull != "" {
		userAgent += " | " + req.UserAgentFull
	}

	// Create comment
	createBuilder := l.svcCtx.DB.Comment.Create().
		SetEntityType(entityType).
		SetEntityID(postID).
		SetAuthorName(author.Name).
		SetContent(req.Content).
		SetIsApproved(true).
		SetUserAgent(userAgent)

	if author.Email != "" {
		createBuilder = createBuilder.SetAuthorEmail(author.Email)
	}

	// Set IP address if provided
	if req.ClientIP != "" {
		createBuilder = createBuilder.SetIPAddress(req.ClientIP)
	}

	if parentID != "" {
		createBuilder = createBuilder.SetParentID(parentID)
	}

	if author.UserIdentityID != "" {
		createBuilder = createBuilder.SetUserIdentityID(author.UserIdentityID)
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
	if author.UserIdentityID != "" {
		userType = "authenticated"
	}

	l.Infof("Created %s comment %s by %s user (author: %s, ip: %s, fingerprint: %s)",
		commentType, c.ID, userType, author.Name, req.ClientIP, req.Fingerprint)

	return &types.BlogCommentData{
		ID:              c.ID,
		BlogPostID:      c.EntityID,
		ParentID:        parentID,
		AuthorName:      c.AuthorName,
		AuthorAvatarURL: author.AvatarURL,
		AuthProvider:    author.AuthProvider,
		CountryCode:     countryCode,
		Content:         c.Content,
		CreatedAt:       c.CreatedAt.Format(time.RFC3339),
		CanDelete:       true,
		Replies:         []types.BlogCommentData{},
	}, nil
}
