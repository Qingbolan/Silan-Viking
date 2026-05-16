package blog

import (
	"context"
	"database/sql"
	"time"

	"silan-backend/internal/ent/blogcomment"
	"silan-backend/internal/ent/commentlike"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type ListBlogCommentsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// List comments for a blog post
func NewListBlogCommentsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListBlogCommentsLogic {
	return &ListBlogCommentsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ListBlogCommentsLogic) ListBlogComments(req *types.BlogCommentListRequest, clientIP, userAgent, fingerprint, userIdentityID string) (resp *types.BlogCommentListResponse, err error) {
	postID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, err
	}

	list, err := l.svcCtx.DB.BlogComment.
		Query().
		Where(blogcomment.BlogPostIDEQ(postID)).
		Order(blogcomment.ByCreatedAt()).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	// cache avatar lookups per email within this request
	avatarCache := map[string]string{}

	lookupAvatar := func(email string) string {
		if email == "" {
			return ""
		}
		if v, ok := avatarCache[email]; ok {
			return v
		}
		var (
			url sql.NullString
			drv = l.svcCtx.Config.Database.Driver
		)
		if drv == "postgres" || drv == "postgresql" {
			_ = l.svcCtx.RawDB.QueryRowContext(l.ctx,
				"SELECT avatar_url FROM user_identities WHERE email = $1 ORDER BY updated_at DESC LIMIT 1",
				email,
			).Scan(&url)
		} else {
			_ = l.svcCtx.RawDB.QueryRowContext(l.ctx,
				"SELECT avatar_url FROM user_identities WHERE email = ? ORDER BY updated_at DESC LIMIT 1",
				email,
			).Scan(&url)
		}
		if url.Valid {
			avatarCache[email] = url.String
			return url.String
		}
		avatarCache[email] = ""
		return ""
	}

	// Build comment tree structure
	commentMap := make(map[string]*types.BlogCommentData)
	var rootCommentIDs []string

	// First pass: create all comment objects
	for _, c := range list {
		parentIDStr := ""
		// Check if ParentID is not zero value (empty UUID)
		if c.ParentID != (uuid.UUID{}) {
			parentIDStr = c.ParentID.String()
		}

		userIdentityIDStr := ""
		if c.UserIdentityID != "" {
			userIdentityIDStr = c.UserIdentityID
		}

		comment := types.BlogCommentData{
			ID:             c.ID.String(),
			BlogPostID:     c.BlogPostID.String(),
			ParentID:       parentIDStr,
			AuthorName:     c.AuthorName,
			AuthorAvatarURL: lookupAvatar(c.AuthorEmail),
			Content:        c.Content,
			CreatedAt:      c.CreatedAt.Format(time.RFC3339),
			UserIdentityID: userIdentityIDStr,
			LikesCount:     c.LikesCount,
			IsLikedByUser:  false, // Will be set below
			Replies:        []types.BlogCommentData{},
		}
		commentMap[c.ID.String()] = &comment

		// Track root comments
		if c.ParentID == (uuid.UUID{}) {
			rootCommentIDs = append(rootCommentIDs, c.ID.String())
		}
	}

	// Second pass: build tree structure
	for _, c := range list {
		if c.ParentID != (uuid.UUID{}) {
			// This is a reply - add to parent's replies
			parentID := c.ParentID.String()
			if parent, exists := commentMap[parentID]; exists {
				comment := commentMap[c.ID.String()]
				parent.Replies = append(parent.Replies, *comment)
			}
		}
	}

	// Third pass: build final root comments array with populated replies
	var rootComments []types.BlogCommentData
	for _, rootID := range rootCommentIDs {
		if rootComment, exists := commentMap[rootID]; exists {
			rootComments = append(rootComments, *rootComment)
		}
	}

	// Fourth pass: check if user has liked each comment
	if userIdentityID != "" || fingerprint != "" {
		l.setLikeStatus(commentMap, userIdentityID, fingerprint)
	}

	// Log analytics data (optional - could be moved to a separate analytics service)
	l.Infof("Returned %d comments (%d root, %d total) for post %s to IP %s",
		len(rootComments), len(rootComments), len(list), req.ID, clientIP)

	return &types.BlogCommentListResponse{Comments: rootComments, Total: len(list)}, nil
}

// setLikeStatus checks if the user has liked each comment and updates the IsLikedByUser field
func (l *ListBlogCommentsLogic) setLikeStatus(commentMap map[string]*types.BlogCommentData, userIdentityID, fingerprint string) {
	var commentIDs []uuid.UUID
	for commentIDStr := range commentMap {
		if commentID, err := uuid.Parse(commentIDStr); err == nil {
			commentIDs = append(commentIDs, commentID)
		}
	}

	if len(commentIDs) == 0 {
		return
	}

	// Query all likes for these comments by this user
	query := l.svcCtx.DB.CommentLike.Query().Where(commentlike.CommentIDIn(commentIDs...))

	if userIdentityID != "" {
		query = query.Where(commentlike.UserIdentityIDEQ(userIdentityID))
	} else if fingerprint != "" {
		query = query.Where(commentlike.FingerprintEQ(fingerprint))
	} else {
		return
	}

	likes, err := query.All(l.ctx)
	if err != nil {
		l.Errorf("Failed to query comment likes: %v", err)
		return
	}

	// Create a set of liked comment IDs for O(1) lookup
	likedComments := make(map[string]bool)
	for _, like := range likes {
		likedComments[like.CommentID.String()] = true
	}

	// Update the IsLikedByUser field for all comments
	var updateComment func(*types.BlogCommentData)
	updateComment = func(comment *types.BlogCommentData) {
		comment.IsLikedByUser = likedComments[comment.ID]
		// Recursively update replies
		for i := range comment.Replies {
			updateComment(&comment.Replies[i])
		}
	}

	for _, comment := range commentMap {
		updateComment(comment)
	}
}

