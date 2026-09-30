package blog

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/commentlike"
	engagementlogic "silan-backend/internal/logic/engagement"
	"silan-backend/internal/publicactor"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
	return l.ListComments(req, comment.EntityTypeBlog, clientIP, userAgent, fingerprint, userIdentityID)
}

func (l *ListBlogCommentsLogic) ListComments(req *types.BlogCommentListRequest, entityType comment.EntityType, clientIP, userAgent, fingerprint, userIdentityID string) (resp *types.BlogCommentListResponse, err error) {
	return l.listComments(req, entityType, clientIP, fingerprint, userIdentityID, false)
}

// ListAllComments is the private moderation projection. Public readers use
// ListComments, which excludes comments whose publication flag is disabled.
func (l *ListBlogCommentsLogic) ListAllComments(req *types.BlogCommentListRequest, entityType comment.EntityType) (resp *types.BlogCommentListResponse, err error) {
	return l.listComments(req, entityType, "", "", "", true)
}

func (l *ListBlogCommentsLogic) listComments(req *types.BlogCommentListRequest, entityType comment.EntityType, clientIP, fingerprint, userIdentityID string, includePrivate bool) (resp *types.BlogCommentListResponse, err error) {
	postID := req.ID

	query := l.svcCtx.DB.Comment.
		Query().
		Where(comment.EntityIDEQ(postID), comment.EntityTypeEQ(entityType))
	if !includePrivate {
		query = query.Where(comment.IsApprovedEQ(true))
	}
	list, err := query.Order(comment.ByCreatedAt()).All(l.ctx)
	if err != nil {
		return nil, err
	}

	return l.projectComments(list, postID, clientIP, fingerprint, userIdentityID)
}

// ProjectAllComments projects already-loaded private snapshot rows through the
// same moderation tree builder as individual comment endpoints. Rows must be
// ordered by creation time and belong to one content item.
func (l *ListBlogCommentsLogic) ProjectAllComments(list []*ent.Comment) (*types.BlogCommentListResponse, error) {
	if len(list) == 0 {
		return &types.BlogCommentListResponse{Comments: []types.BlogCommentData{}}, nil
	}
	return l.projectComments(list, list[0].EntityID, "", "", "")
}

func (l *ListBlogCommentsLogic) projectComments(list []*ent.Comment, postID, clientIP, fingerprint, userIdentityID string) (*types.BlogCommentListResponse, error) {
	actor := commentruntime.NewActor(userIdentityID, fingerprint)
	// cache avatar/provider lookups per email within this request
	type identityInfo struct {
		avatar   string
		provider string
	}
	identityCache := map[string]identityInfo{}

	lookupIdentity := func(email string) identityInfo {
		if email == "" {
			return identityInfo{}
		}
		if v, ok := identityCache[email]; ok {
			return v
		}
		var (
			url      sql.NullString
			provider sql.NullString
			drv      = l.svcCtx.Config.Database.Driver
		)
		if drv == "postgres" || drv == "postgresql" {
			_ = l.svcCtx.RawDB.QueryRowContext(l.ctx,
				"SELECT avatar_url, provider FROM user_identities WHERE email = $1 ORDER BY updated_at DESC LIMIT 1",
				email,
			).Scan(&url, &provider)
		} else {
			_ = l.svcCtx.RawDB.QueryRowContext(l.ctx,
				"SELECT avatar_url, provider FROM user_identities WHERE email = ? ORDER BY updated_at DESC LIMIT 1",
				email,
			).Scan(&url, &provider)
		}
		info := identityInfo{avatar: url.String, provider: provider.String}
		identityCache[email] = info
		return info
	}

	// Build comment tree structure
	commentMap := make(map[string]*types.BlogCommentData)
	var rootCommentIDs []string

	// First pass: create all comment objects
	for _, c := range list {
		identity := lookupIdentity(c.AuthorEmail)
		commentFingerprint := commentruntime.Fingerprint(c)
		actorID := publicactor.ID(publicactor.Visitor, commentFingerprint)
		visitorNumber := ""
		if c.UserIdentityID != "" {
			actorID = publicactor.ID(publicactor.User, c.UserIdentityID)
		} else {
			visitorNumber = engagementlogic.VisitorNumber(commentFingerprint)
		}
		comment := types.BlogCommentData{
			ID:              c.ID,
			ActorID:         actorID,
			BlogPostID:      c.EntityID,
			ParentID:        c.ParentID,
			AuthorName:      c.AuthorName,
			AuthorAvatarURL: identity.avatar,
			AuthProvider:    identity.provider,
			CountryCode:     strings.ToUpper(c.CountryCode),
			VisitorNumber:   visitorNumber,
			Content:         c.Content,
			CreatedAt:       c.CreatedAt.Format(time.RFC3339),
			CanDelete:       actor.CanDelete(c),
			LikesCount:      c.LikesCount,
			IsLikedByUser:   false, // Will be set below
			IsPublic:        c.IsApproved,
			Replies:         []types.BlogCommentData{},
		}
		commentMap[c.ID] = &comment

		// Track root comments
		if c.ParentID == "" {
			rootCommentIDs = append(rootCommentIDs, c.ID)
		}
	}

	// Resolve actor-specific state before copying values into the reply tree.
	if userIdentityID != "" || fingerprint != "" {
		l.setLikeStatus(commentMap, userIdentityID, fingerprint)
	}

	childrenByParent := make(map[string][]string)
	for _, c := range list {
		if c.ParentID != "" {
			childrenByParent[c.ParentID] = append(childrenByParent[c.ParentID], c.ID)
		}
	}
	var buildThread func(string) types.BlogCommentData
	buildThread = func(commentID string) types.BlogCommentData {
		current := *commentMap[commentID]
		current.Replies = make([]types.BlogCommentData, 0, len(childrenByParent[commentID]))
		for _, childID := range childrenByParent[commentID] {
			current.Replies = append(current.Replies, buildThread(childID))
		}
		return current
	}

	// Reconstruct from parent relations so replies remain complete at every depth.
	rootComments := make([]types.BlogCommentData, 0, len(rootCommentIDs))
	for _, rootID := range rootCommentIDs {
		if _, exists := commentMap[rootID]; exists {
			rootComments = append(rootComments, buildThread(rootID))
		}
	}

	// Log analytics data (optional - could be moved to a separate analytics service)
	l.Infof("Returned %d comments (%d root, %d total) for post %s to IP %s",
		len(rootComments), len(rootComments), len(list), postID, clientIP)

	return &types.BlogCommentListResponse{Comments: rootComments, Total: len(list)}, nil
}

// setLikeStatus checks if the user has liked each comment and updates the IsLikedByUser field
func (l *ListBlogCommentsLogic) setLikeStatus(commentMap map[string]*types.BlogCommentData, userIdentityID, fingerprint string) {
	var commentIDs []string
	for commentIDStr := range commentMap {
		commentIDs = append(commentIDs, commentIDStr)
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
		likedComments[like.CommentID] = true
	}

	for _, comment := range commentMap {
		comment.IsLikedByUser = likedComments[comment.ID]
	}
}
