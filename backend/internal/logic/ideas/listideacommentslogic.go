package ideas

import (
	"context"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/useridentity"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"strings"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type ListCommentsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// List comments for an idea
func NewListIdeaCommentsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListCommentsLogic {
	return &ListCommentsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ListCommentsLogic) ListComments(req *types.IdeaCommentListRequest, clientIP, userAgent, fingerprint, userIdentityID string) (resp *types.IdeaCommentListResponse, err error) {
	// Validate idea id format
	ideaUUID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, err
	}

	// Fetch comments using entgo
	// Support both legacy entity_type "idea" and new namespaced form "idea_<type>"
	desiredEntityType := "idea_" + strings.ToLower(req.Type)
	comments, err := l.svcCtx.DB.Comment.
		Query().
		Where(
			comment.EntityIDEQ(ideaUUID),
			func(s *sql.Selector) {
				s.Where(sql.Or(
					sql.EQ(s.C("entity_type"), "idea"),
					sql.EQ(s.C("entity_type"), desiredEntityType),
				))
			},
			comment.TypeEQ(comment.Type(req.Type)),
		).
		Order(ent.Asc(comment.FieldCreatedAt)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	lookupAvatar := func(email string) string {
		if email == "" {
			return ""
		}
		// Use entgo to lookup avatar
		identity, err := l.svcCtx.DB.UserIdentity.
			Query().
			Where(useridentity.EmailEQ(email)).
			Order(ent.Desc(useridentity.FieldUpdatedAt)).
			First(l.ctx)
		if err == nil && identity.AvatarURL != "" {
			return identity.AvatarURL
		}
		return ""
	}

	commentMap := make(map[string]*types.IdeaCommentData)
	var order []string
	for _, comment := range comments {
		parentIDStr := ""
		if comment.ParentID != (uuid.UUID{}) {
			parentIDStr = comment.ParentID.String()
		}
		commentData := types.IdeaCommentData{
			ID:              comment.ID.String(),
			IdeaID:          comment.EntityID.String(),
			ParentID:        parentIDStr,
			AuthorName:      comment.AuthorName,
			AuthorAvatarURL: lookupAvatar(comment.AuthorEmail),
			Content:         comment.Content,
			Type:            string(comment.Type),
			CreatedAt:       comment.CreatedAt.Format(time.RFC3339),
			UserIdentityID:  comment.UserIdentityID,
			LikesCount:      comment.LikesCount,
			IsLikedByUser:   false,
			Replies:         []types.IdeaCommentData{},
		}
		commentMap[comment.ID.String()] = &commentData
		order = append(order, comment.ID.String())
	}

	// Build tree: parent->children
	var rootIDs []string
	for _, id := range order {
		c := commentMap[id]
		if c.ParentID == "" {
			rootIDs = append(rootIDs, id)
			continue
		}
		if parent, ok := commentMap[c.ParentID]; ok {
			parent.Replies = append(parent.Replies, *c)
		}
	}

	// Determine like status for this user using entgo
	if (userIdentityID != "" || fingerprint != "") && len(order) > 0 {
		// Convert comment IDs to UUIDs
		commentUUIDs := make([]uuid.UUID, 0, len(order))
		for _, id := range order {
			if commentUUID, err := uuid.Parse(id); err == nil {
				commentUUIDs = append(commentUUIDs, commentUUID)
			}
		}

		if len(commentUUIDs) > 0 {
			// Use entgo to query likes
			likeQuery := l.svcCtx.DB.CommentLike.Query()

			// Add comment ID filter
			likeQuery = likeQuery.Where(func(s *sql.Selector) {
				s.Where(sql.In(s.C("comment_id"), func() []interface{} {
					result := make([]interface{}, len(commentUUIDs))
					for i, id := range commentUUIDs {
						result[i] = id
					}
					return result
				}()...))
			})

			// Add user identity or fingerprint filter
			if userIdentityID != "" && fingerprint != "" {
				likeQuery = likeQuery.Where(func(s *sql.Selector) {
					s.Where(sql.Or(
						sql.EQ(s.C("user_identity_id"), userIdentityID),
						sql.EQ(s.C("fingerprint"), fingerprint),
					))
				})
			} else if userIdentityID != "" {
				likeQuery = likeQuery.Where(func(s *sql.Selector) {
					s.Where(sql.EQ(s.C("user_identity_id"), userIdentityID))
				})
			} else if fingerprint != "" {
				likeQuery = likeQuery.Where(func(s *sql.Selector) {
					s.Where(sql.EQ(s.C("fingerprint"), fingerprint))
				})
			}

			likes, err := likeQuery.All(l.ctx)
			if err == nil {
				liked := make(map[string]bool)
				for _, like := range likes {
					liked[like.CommentID.String()] = true
				}
				for _, c := range commentMap {
					c.IsLikedByUser = liked[c.ID]
				}
			}
		}
	}

	// Build final root list
	var roots []types.IdeaCommentData
	for _, id := range rootIDs {
		if r, ok := commentMap[id]; ok {
			roots = append(roots, *r)
		}
	}
	if roots == nil {
		roots = []types.IdeaCommentData{}
	}
	return &types.IdeaCommentListResponse{Comments: roots, Total: len(order)}, nil
}
