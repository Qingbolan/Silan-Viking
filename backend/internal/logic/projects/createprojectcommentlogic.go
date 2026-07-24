package projects

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"silan-backend/internal/commentruntime"
	entcomment "silan-backend/internal/ent/comment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
		SetAuthorName(author.Name).
		SetContent(req.Content).
		SetIsApproved(true). // Auto-approve for now
		SetLikesCount(0)

	if author.Email != "" {
		commentBuilder = commentBuilder.SetAuthorEmail(author.Email)
	}
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
	if author.UserIdentityID != "" {
		commentBuilder = commentBuilder.SetUserIdentityID(author.UserIdentityID)
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
		AuthorAvatarURL: author.AvatarURL,
		AuthProvider:    author.AuthProvider,
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
