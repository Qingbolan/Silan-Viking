package updates

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/recentupdate"
	"silan-backend/internal/ent/useridentity"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func resolveUpdateID(ctx context.Context, svcCtx *svc.ServiceContext, key string) (string, error) {
	row, err := svcCtx.DB.RecentUpdate.Query().
		Where(recentupdate.Or(recentupdate.IDEQ(key), recentupdate.SlugEQ(key))).
		Only(ctx)
	if err != nil {
		return "", fmt.Errorf("update not found: %s", key)
	}
	return row.ID, nil
}

func UpdateEngagement(ctx context.Context, svcCtx *svc.ServiceContext, key, fingerprint, identity string) (*types.UpdateEngagementResponse, error) {
	id, err := resolveUpdateID(ctx, svcCtx, key)
	if err != nil {
		return nil, err
	}
	likes, err := svcCtx.DB.ContentInteraction.Query().Where(
		contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeUpdate),
		contentinteraction.EntityIDEQ(id),
		contentinteraction.KindEQ(contentinteraction.KindLike),
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	comments, err := svcCtx.DB.Comment.Query().Where(
		comment.EntityTypeEQ(comment.EntityTypeUpdate),
		comment.EntityIDEQ(id),
		comment.IsApprovedEQ(true),
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	query := svcCtx.DB.ContentInteraction.Query().Where(
		contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeUpdate),
		contentinteraction.EntityIDEQ(id),
		contentinteraction.KindEQ(contentinteraction.KindLike),
	)
	switch {
	case identity != "" && fingerprint != "":
		query = query.Where(contentinteraction.Or(contentinteraction.UserIdentityIDEQ(identity), contentinteraction.FingerprintEQ(fingerprint)))
	case identity != "":
		query = query.Where(contentinteraction.UserIdentityIDEQ(identity))
	case fingerprint != "":
		query = query.Where(contentinteraction.FingerprintEQ(fingerprint))
	default:
		return &types.UpdateEngagementResponse{Likes: likes, Comments: comments}, nil
	}
	liked, err := query.Exist(ctx)
	return &types.UpdateEngagementResponse{Likes: likes, Comments: comments, IsLikedByUser: liked}, err
}

func ToggleUpdateLike(ctx context.Context, svcCtx *svc.ServiceContext, req *types.LikeProjectRequest) (*types.UpdateEngagementResponse, error) {
	id, err := resolveUpdateID(ctx, svcCtx, req.ProjectID)
	if err != nil {
		return nil, err
	}
	if req.AuthenticatedUserID == "" && strings.TrimSpace(req.Fingerprint) == "" {
		return nil, fmt.Errorf("fingerprint or user_identity_id is required")
	}
	current, err := UpdateEngagement(ctx, svcCtx, id, req.Fingerprint, req.AuthenticatedUserID)
	if err != nil {
		return nil, err
	}
	if current.IsLikedByUser {
		deleteQuery := svcCtx.DB.ContentInteraction.Delete().Where(
			contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeUpdate),
			contentinteraction.EntityIDEQ(id),
			contentinteraction.KindEQ(contentinteraction.KindLike),
		)
		if req.AuthenticatedUserID != "" && req.Fingerprint != "" {
			deleteQuery = deleteQuery.Where(contentinteraction.Or(contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID), contentinteraction.FingerprintEQ(req.Fingerprint)))
		} else if req.AuthenticatedUserID != "" {
			deleteQuery = deleteQuery.Where(contentinteraction.UserIdentityIDEQ(req.AuthenticatedUserID))
		} else {
			deleteQuery = deleteQuery.Where(contentinteraction.FingerprintEQ(req.Fingerprint))
		}
		if _, err := deleteQuery.Exec(ctx); err != nil {
			return nil, err
		}
	} else if err := analytics.RecordContentInteraction(ctx, svcCtx.DB, svcCtx.Traffic, svcCtx.CountryResolver, analytics.InteractionEvent{
		EntityType: "update", EntityID: id, Kind: "like", UserIdentityID: req.AuthenticatedUserID,
		Fingerprint: req.Fingerprint, IPAddress: req.ClientIP, UserAgent: req.UserAgentFull, Referrer: req.Referrer,
	}); err != nil {
		return nil, err
	}
	return UpdateEngagement(ctx, svcCtx, id, req.Fingerprint, req.AuthenticatedUserID)
}

func CreateUpdateComment(ctx context.Context, svcCtx *svc.ServiceContext, req *types.CreateIdeaCommentRequest) (*types.UpdateCommentData, error) {
	id, err := resolveUpdateID(ctx, svcCtx, req.ID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, fmt.Errorf("content is required")
	}
	authorName, authorEmail, avatar := strings.TrimSpace(req.AuthorName), strings.TrimSpace(req.AuthorEmail), ""
	if req.AuthenticatedUserID != "" {
		user, err := svcCtx.DB.UserIdentity.Get(ctx, req.AuthenticatedUserID)
		if err != nil {
			return nil, fmt.Errorf("invalid user identity")
		}
		authorName, authorEmail, avatar = user.DisplayName, user.Email, user.AvatarURL
	} else if authorName == "" || !strings.Contains(authorEmail, "@") {
		return nil, fmt.Errorf("author_name and a valid author_email are required")
	}
	if req.ParentId != "" {
		parent, err := svcCtx.DB.Comment.Get(ctx, req.ParentId)
		if err != nil || parent.EntityType != comment.EntityTypeUpdate || parent.EntityID != id {
			return nil, errors.New("parent comment belongs to a different update")
		}
	}
	builder := svcCtx.DB.Comment.Create().
		SetEntityType(comment.EntityTypeUpdate).SetEntityID(id).SetType(comment.TypeGeneral).
		SetAuthorName(authorName).SetAuthorEmail(authorEmail).SetContent(strings.TrimSpace(req.Content)).
		SetIsApproved(true).SetLikesCount(0).SetUserAgent("fp:" + strings.TrimSpace(req.Fingerprint))
	if req.ParentId != "" {
		builder.SetParentID(req.ParentId)
	}
	if req.AuthenticatedUserID != "" {
		builder.SetUserIdentityID(req.AuthenticatedUserID)
	}
	if req.ClientIP != "" {
		builder.SetIPAddress(req.ClientIP)
	}
	row, err := builder.Save(ctx)
	if err != nil {
		return nil, err
	}
	return &types.UpdateCommentData{ID: row.ID, UpdateID: id, ParentID: row.ParentID, AuthorName: authorName, AuthorAvatarURL: avatar, Content: row.Content, CreatedAt: row.CreatedAt.Format(time.RFC3339), CanDelete: true, Replies: []types.UpdateCommentData{}}, nil
}

func ListUpdateComments(ctx context.Context, svcCtx *svc.ServiceContext, key, fingerprint, identity string) (*types.UpdateCommentListResponse, error) {
	id, err := resolveUpdateID(ctx, svcCtx, key)
	if err != nil {
		return nil, err
	}
	rows, err := svcCtx.DB.Comment.Query().Where(
		comment.EntityTypeEQ(comment.EntityTypeUpdate), comment.EntityIDEQ(id), comment.IsApprovedEQ(true),
	).Order(ent.Asc(comment.FieldCreatedAt)).All(ctx)
	if err != nil {
		return nil, err
	}
	actor := commentruntime.NewActor(identity, fingerprint)
	comments := make(map[string]*types.UpdateCommentData, len(rows))
	order := make([]string, 0, len(rows))
	for _, row := range rows {
		avatar := ""
		if user, lookupErr := svcCtx.DB.UserIdentity.Query().Where(useridentity.EmailEQ(row.AuthorEmail)).Order(ent.Desc(useridentity.FieldUpdatedAt)).First(ctx); lookupErr == nil {
			avatar = user.AvatarURL
		}
		comments[row.ID] = &types.UpdateCommentData{ID: row.ID, UpdateID: id, ParentID: row.ParentID, AuthorName: row.AuthorName, AuthorAvatarURL: avatar, Content: row.Content, CreatedAt: row.CreatedAt.Format(time.RFC3339), CanDelete: actor.CanDelete(row), LikesCount: row.LikesCount, Replies: []types.UpdateCommentData{}}
		order = append(order, row.ID)
	}
	if len(order) > 0 && (identity != "" || fingerprint != "") {
		likes, _ := svcCtx.DB.CommentLike.Query().Where(func(selector *sql.Selector) {
			selector.Where(sql.In(selector.C("comment_id"), stringsToInterfaces(order)...))
		}).All(ctx)
		for _, like := range likes {
			if (identity != "" && like.UserIdentityID == identity) || (fingerprint != "" && like.Fingerprint == fingerprint) {
				if value := comments[like.CommentID]; value != nil {
					value.IsLikedByUser = true
				}
			}
		}
	}
	rootIDs := make([]string, 0)
	for _, key := range order {
		value := comments[key]
		if value.ParentID == "" {
			rootIDs = append(rootIDs, key)
		} else if parent := comments[value.ParentID]; parent != nil {
			parent.Replies = append(parent.Replies, *value)
		}
	}
	roots := make([]types.UpdateCommentData, 0, len(rootIDs))
	for _, key := range rootIDs {
		roots = append(roots, *comments[key])
	}
	return &types.UpdateCommentListResponse{Comments: roots, Total: len(rows)}, nil
}

func stringsToInterfaces(values []string) []interface{} {
	result := make([]interface{}, len(values))
	for index, value := range values {
		result[index] = value
	}
	return result
}

func ToggleUpdateCommentLike(ctx context.Context, svcCtx *svc.ServiceContext, req *types.LikeCommentRequest) (*types.LikeCommentResponse, error) {
	row, err := svcCtx.DB.Comment.Get(ctx, req.CommentID)
	if err != nil || row.EntityType != comment.EntityTypeUpdate {
		return nil, fmt.Errorf("update comment not found")
	}
	count, liked, err := commentruntime.ToggleLike(ctx, svcCtx.DB, req.CommentID, req.Fingerprint, req.AuthenticatedUserID, req.ClientIP)
	if err != nil {
		return nil, err
	}
	return &types.LikeCommentResponse{LikesCount: count, IsLikedByUser: liked}, nil
}

func DeleteUpdateComment(ctx context.Context, svcCtx *svc.ServiceContext, commentID, fingerprint, identity string) error {
	row, err := svcCtx.DB.Comment.Get(ctx, commentID)
	if err != nil || row.EntityType != comment.EntityTypeUpdate {
		return fmt.Errorf("update comment not found")
	}
	if !commentruntime.NewActor(identity, fingerprint).CanDelete(row) {
		return fmt.Errorf("not authorized to delete this comment")
	}
	return commentruntime.DeleteTree(ctx, svcCtx.DB, commentID, comment.EntityTypeUpdate)
}
