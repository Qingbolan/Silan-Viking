package projects

import (
	"context"
	"strings"
	"time"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/useridentity"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type ListProjectCommentsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// List comments for a project
func NewListProjectCommentsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListProjectCommentsLogic {
	return &ListProjectCommentsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ListProjectCommentsLogic) ListProjectComments(req *types.ProjectCommentListRequest) (resp *types.ProjectCommentListResponse, err error) {
	// Validate project id format
	projectUUID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, err
	}

	// Fetch comments using entgo - using project_<type> entity type format
	desiredEntityType := "project_" + strings.ToLower(req.Type)
	comments, err := l.svcCtx.DB.Comment.
		Query().
		Where(
			comment.EntityIDEQ(projectUUID),
			func(s *sql.Selector) {
				s.Where(sql.Or(
					sql.EQ(s.C("entity_type"), "project"),
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

	commentMap := make(map[string]*types.ProjectCommentData)
	var order []string
	for _, comment := range comments {
		parentIDStr := ""
		if comment.ParentID != (uuid.UUID{}) {
			parentIDStr = comment.ParentID.String()
		}
		commentData := types.ProjectCommentData{
			ID:              comment.ID.String(),
			ProjectID:       comment.EntityID.String(),
			ParentID:        parentIDStr,
			AuthorName:      comment.AuthorName,
			AuthorAvatarURL: lookupAvatar(comment.AuthorEmail),
			Content:         comment.Content,
			Type:            string(comment.Type),
			CreatedAt:       comment.CreatedAt.Format(time.RFC3339),
			UserIdentityID:  comment.UserIdentityID,
			LikesCount:      comment.LikesCount,
			IsLikedByUser:   false,
			Replies:         []types.ProjectCommentData{},
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

	// Build final root list
	var roots []types.ProjectCommentData
	for _, id := range rootIDs {
		if r, ok := commentMap[id]; ok {
			roots = append(roots, *r)
		}
	}
	if roots == nil {
		roots = []types.ProjectCommentData{}
	}
	return &types.ProjectCommentListResponse{Comments: roots, Total: len(order)}, nil
}
