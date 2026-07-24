package moments

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/ent/useridentity"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func resolveUpdateID(ctx context.Context, svcCtx *svc.ServiceContext, key string) (string, error) {
	row, err := svcCtx.DB.Moment.Query().
		Where(moment.Or(moment.IDEQ(key), moment.SlugEQ(key))).
		Only(ctx)
	if err != nil {
		return "", fmt.Errorf("moment not found: %s", key)
	}
	return row.ID, nil
}

func UpdateEngagement(ctx context.Context, svcCtx *svc.ServiceContext, key, fingerprint, identity string) (*types.UpdateEngagementResponse, error) {
	id, err := resolveUpdateID(ctx, svcCtx, key)
	if err != nil {
		return nil, err
	}
	likes, err := svcCtx.DB.ContentInteraction.Query().Where(
		contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeMoment),
		contentinteraction.EntityIDEQ(id),
		contentinteraction.KindEQ(contentinteraction.KindLike),
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	comments, err := svcCtx.DB.Comment.Query().Where(
		comment.EntityTypeEQ(comment.EntityTypeMoment),
		comment.EntityIDEQ(id),
		comment.IsApprovedEQ(true),
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	likers, err := updateLikers(ctx, svcCtx, id)
	if err != nil {
		return nil, err
	}
	query := svcCtx.DB.ContentInteraction.Query().Where(
		contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeMoment),
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
		return &types.UpdateEngagementResponse{Likes: likes, Comments: comments, Likers: likers}, nil
	}
	liked, err := query.Exist(ctx)
	return &types.UpdateEngagementResponse{Likes: likes, Comments: comments, IsLikedByUser: liked, Likers: likers}, err
}

func updateLikers(ctx context.Context, svcCtx *svc.ServiceContext, momentID string) ([]types.UpdateLiker, error) {
	rows, err := svcCtx.DB.ContentInteraction.Query().Where(
		contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeMoment),
		contentinteraction.EntityIDEQ(momentID),
		contentinteraction.KindEQ(contentinteraction.KindLike),
	).Order(ent.Desc(contentinteraction.FieldCreatedAt)).Limit(10).All(ctx)
	if err != nil {
		return nil, err
	}

	identityIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.UserIdentityID != nil {
			identityIDs = append(identityIDs, *row.UserIdentityID)
		}
	}
	identities := make(map[string]*ent.UserIdentity, len(identityIDs))
	if len(identityIDs) > 0 {
		users, queryErr := svcCtx.DB.UserIdentity.Query().
			Where(useridentity.IDIn(identityIDs...)).
			All(ctx)
		if queryErr != nil {
			return nil, queryErr
		}
		for _, user := range users {
			identities[user.ID] = user
		}
	}

	result := make([]types.UpdateLiker, 0, len(rows))
	for _, row := range rows {
		if row.UserIdentityID != nil {
			user := identities[*row.UserIdentityID]
			if user != nil {
				result = append(result, types.UpdateLiker{
					Kind: "user", AvatarURL: user.AvatarURL, Label: user.DisplayName,
				})
				continue
			}
		}
		fingerprint := ""
		if row.Fingerprint != nil {
			fingerprint = *row.Fingerprint
		}
		result = append(result, types.UpdateLiker{
			Kind:          "visitor",
			CountryCode:   strings.ToUpper(row.CountryCode),
			VisitorNumber: visitorNumber(fingerprint),
		})
	}
	return result, nil
}

func visitorNumber(fingerprint string) string {
	sum := sha256.Sum256([]byte(fingerprint))
	number := (int(sum[0])<<8|int(sum[1]))%99 + 1
	return fmt.Sprintf("%02d", number)
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
			contentinteraction.EntityTypeEQ(contentinteraction.EntityTypeMoment),
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
		EntityType: "moment", EntityID: id, Kind: "like", UserIdentityID: req.AuthenticatedUserID,
		Fingerprint: req.Fingerprint, IPAddress: req.ClientIP, CountryCode: req.CountryCode,
		UserAgent: req.UserAgentFull, Referrer: req.Referrer,
	}); err != nil {
		return nil, err
	}
	return UpdateEngagement(ctx, svcCtx, id, req.Fingerprint, req.AuthenticatedUserID)
}

func CreateUpdateComment(ctx context.Context, svcCtx *svc.ServiceContext, req *types.CreateMomentCommentRequest) (*types.UpdateCommentData, error) {
	id, err := resolveUpdateID(ctx, svcCtx, req.ID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, fmt.Errorf("content is required")
	}
	author, err := commentruntime.ResolveAuthor(
		ctx,
		svcCtx.DB,
		req.AuthenticatedUserID,
		req.AuthorName,
		req.Fingerprint,
		req.CountryCode,
		req.RegionCode,
	)
	if err != nil {
		return nil, err
	}
	if req.ParentId != "" {
		parent, err := svcCtx.DB.Comment.Get(ctx, req.ParentId)
		if err != nil || parent.EntityType != comment.EntityTypeMoment || parent.EntityID != id {
			return nil, errors.New("parent comment belongs to a different moment")
		}
	}
	builder := svcCtx.DB.Comment.Create().
		SetEntityType(comment.EntityTypeMoment).SetEntityID(id).SetType(comment.TypeGeneral).
		SetAuthorName(author.Name).SetContent(strings.TrimSpace(req.Content)).
		SetIsApproved(true).SetLikesCount(0).SetUserAgent("fp:" + strings.TrimSpace(req.Fingerprint))
	if author.Email != "" {
		builder.SetAuthorEmail(author.Email)
	}
	if req.ParentId != "" {
		builder.SetParentID(req.ParentId)
	}
	if author.UserIdentityID != "" {
		builder.SetUserIdentityID(author.UserIdentityID)
	}
	if req.ClientIP != "" {
		builder.SetIPAddress(req.ClientIP)
	}
	countryCode := strings.ToUpper(req.CountryCode)
	if countryCode == "" && req.ClientIP != "" && svcCtx.CountryResolver != nil {
		countryCode = strings.ToUpper(svcCtx.CountryResolver.Resolve(req.ClientIP).CountryCode)
	}
	if countryCode != "" {
		builder.SetCountryCode(countryCode)
	}
	row, err := builder.Save(ctx)
	if err != nil {
		return nil, err
	}
	visitor := ""
	if req.AuthenticatedUserID == "" && strings.TrimSpace(req.Fingerprint) != "" {
		visitor = visitorNumber(req.Fingerprint)
	}
	return &types.UpdateCommentData{ID: row.ID, UpdateID: id, ParentID: row.ParentID, AuthorName: author.Name, AuthorAvatarURL: author.AvatarURL, AuthProvider: author.AuthProvider, CountryCode: countryCode, VisitorNumber: visitor, Content: row.Content, CreatedAt: row.CreatedAt.Format(time.RFC3339), CanDelete: true, Replies: []types.UpdateCommentData{}}, nil
}

func ListUpdateComments(ctx context.Context, svcCtx *svc.ServiceContext, key, fingerprint, identity string) (*types.UpdateCommentListResponse, error) {
	id, err := resolveUpdateID(ctx, svcCtx, key)
	if err != nil {
		return nil, err
	}
	rows, err := svcCtx.DB.Comment.Query().Where(
		comment.EntityTypeEQ(comment.EntityTypeMoment), comment.EntityIDEQ(id), comment.IsApprovedEQ(true),
	).Order(ent.Asc(comment.FieldCreatedAt)).All(ctx)
	if err != nil {
		return nil, err
	}
	actor := commentruntime.NewActor(identity, fingerprint)
	comments := make(map[string]*types.UpdateCommentData, len(rows))
	order := make([]string, 0, len(rows))
	for _, row := range rows {
		avatar, provider := "", ""
		if row.AuthorEmail != "" {
			if user, lookupErr := svcCtx.DB.UserIdentity.Query().Where(useridentity.EmailEQ(row.AuthorEmail)).Order(ent.Desc(useridentity.FieldUpdatedAt)).First(ctx); lookupErr == nil {
				avatar, provider = user.AvatarURL, user.Provider
			}
		}
		visitor := ""
		if row.UserIdentityID == "" {
			if stored := commentruntime.Fingerprint(row); stored != "" {
				visitor = visitorNumber(stored)
			}
		}
		comments[row.ID] = &types.UpdateCommentData{ID: row.ID, UpdateID: id, ParentID: row.ParentID, AuthorName: row.AuthorName, AuthorAvatarURL: avatar, AuthProvider: provider, CountryCode: strings.ToUpper(row.CountryCode), VisitorNumber: visitor, Content: row.Content, CreatedAt: row.CreatedAt.Format(time.RFC3339), CanDelete: actor.CanDelete(row), LikesCount: row.LikesCount, Replies: []types.UpdateCommentData{}}
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
	if err != nil || row.EntityType != comment.EntityTypeMoment {
		return nil, fmt.Errorf("moment comment not found")
	}
	count, liked, err := commentruntime.ToggleLike(ctx, svcCtx.DB, req.CommentID, req.Fingerprint, req.AuthenticatedUserID, req.ClientIP)
	if err != nil {
		return nil, err
	}
	return &types.LikeCommentResponse{LikesCount: count, IsLikedByUser: liked}, nil
}

func DeleteUpdateComment(ctx context.Context, svcCtx *svc.ServiceContext, commentID, fingerprint, identity string) error {
	row, err := svcCtx.DB.Comment.Get(ctx, commentID)
	if err != nil || row.EntityType != comment.EntityTypeMoment {
		return fmt.Errorf("moment comment not found")
	}
	if !commentruntime.NewActor(identity, fingerprint).CanDelete(row) {
		return fmt.Errorf("not authorized to delete this comment")
	}
	return commentruntime.DeleteTree(ctx, svcCtx.DB, commentID, comment.EntityTypeMoment)
}
