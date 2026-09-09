package people

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/episode"
	"silan-backend/internal/ent/moment"
	"silan-backend/internal/ent/project"
	"silan-backend/internal/ent/projectlike"
	engagementlogic "silan-backend/internal/logic/engagement"
	"silan-backend/internal/publicactor"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

var ErrPublicActorNotFound = errors.New("public actor not found")

type GetPublicActorLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

type resolvedActor struct {
	kind        publicactor.Kind
	identity    *ent.UserIdentity
	fingerprint string
}

type actorActivity struct {
	id         string
	kind       string
	entityType string
	entityID   string
	content    string
	createdAt  time.Time
}

type entitySummary struct {
	slug  string
	title string
	path  string
}

func NewGetPublicActorLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetPublicActorLogic {
	return &GetPublicActorLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// GetPublicActor projects an internal OAuth identity or browser fingerprint
// into a public profile. Private keys never leave this ownership boundary.
func (l *GetPublicActorLogic) GetPublicActor(req *types.PublicActorRequest) (*types.PublicActorProfile, error) {
	actor, err := l.resolveActor(strings.TrimSpace(req.ActorID))
	if err != nil {
		return nil, err
	}

	comments, likes, projectLikes, err := l.loadActorRows(actor)
	if err != nil {
		return nil, err
	}

	events := make([]actorActivity, 0, len(comments)+len(likes)+len(projectLikes))
	for _, row := range comments {
		events = append(events, actorActivity{
			id:         row.ID,
			kind:       "comment",
			entityType: string(row.EntityType),
			entityID:   row.EntityID,
			content:    row.Content,
			createdAt:  row.CreatedAt,
		})
	}
	for _, row := range likes {
		events = append(events, actorActivity{
			id:         row.ID,
			kind:       "like",
			entityType: string(row.EntityType),
			entityID:   row.EntityID,
			createdAt:  row.CreatedAt,
		})
	}
	for _, row := range projectLikes {
		events = append(events, actorActivity{
			id:         row.ID,
			kind:       "like",
			entityType: "project",
			entityID:   row.ProjectID,
			createdAt:  row.CreatedAt,
		})
	}

	summaries, err := l.loadPublicEntitySummaries(events, req.Language)
	if err != nil {
		return nil, err
	}

	activities := make([]types.PublicActorActivity, 0, len(events))
	for _, event := range events {
		summary, ok := summaries[entityKey(event.entityType, event.entityID)]
		if !ok {
			continue
		}
		activities = append(activities, types.PublicActorActivity{
			ID:          event.id,
			Kind:        event.kind,
			EntityType:  event.entityType,
			EntityID:    event.entityID,
			EntitySlug:  summary.slug,
			EntityTitle: summary.title,
			EntityPath:  summary.path,
			Content:     event.content,
			CreatedAt:   event.createdAt.Format(time.RFC3339),
		})
	}
	sort.SliceStable(activities, func(i, j int) bool {
		return activities[i].CreatedAt > activities[j].CreatedAt
	})
	if len(activities) > 100 {
		activities = activities[:100]
	}

	profile := l.buildProfile(req, actor, comments, likes, activities)
	return profile, nil
}

func (l *GetPublicActorLogic) resolveActor(actorID string) (resolvedActor, error) {
	kind, ok := publicactor.KindOf(actorID)
	if !ok {
		return resolvedActor{}, ErrPublicActorNotFound
	}

	if kind == publicactor.User {
		identities, err := l.svcCtx.DB.UserIdentity.Query().All(l.ctx)
		if err != nil {
			return resolvedActor{}, err
		}
		for _, identity := range identities {
			if publicactor.ID(publicactor.User, identity.ID) == actorID {
				return resolvedActor{kind: kind, identity: identity}, nil
			}
		}
		return resolvedActor{}, ErrPublicActorNotFound
	}

	comments, err := l.svcCtx.DB.Comment.Query().
		Where(comment.IsApprovedEQ(true)).
		All(l.ctx)
	if err != nil {
		return resolvedActor{}, err
	}
	for _, row := range comments {
		if row.UserIdentityID != "" {
			continue
		}
		fingerprint := commentruntime.Fingerprint(row)
		if publicactor.ID(publicactor.Visitor, fingerprint) == actorID {
			return resolvedActor{kind: kind, fingerprint: fingerprint}, nil
		}
	}

	likes, err := l.svcCtx.DB.ContentInteraction.Query().
		Where(contentinteraction.KindEQ(contentinteraction.KindLike)).
		All(l.ctx)
	if err != nil {
		return resolvedActor{}, err
	}
	for _, row := range likes {
		if row.UserIdentityID == nil && row.Fingerprint != nil && publicactor.ID(publicactor.Visitor, *row.Fingerprint) == actorID {
			return resolvedActor{kind: kind, fingerprint: *row.Fingerprint}, nil
		}
	}

	projectLikes, err := l.svcCtx.DB.ProjectLike.Query().
		Where(projectlike.FingerprintNEQ("")).
		All(l.ctx)
	if err != nil {
		return resolvedActor{}, err
	}
	for _, row := range projectLikes {
		if row.UserIdentityID == "" && publicactor.ID(publicactor.Visitor, row.Fingerprint) == actorID {
			return resolvedActor{kind: kind, fingerprint: row.Fingerprint}, nil
		}
	}

	return resolvedActor{}, ErrPublicActorNotFound
}

func (l *GetPublicActorLogic) loadActorRows(actor resolvedActor) ([]*ent.Comment, []*ent.ContentInteraction, []*ent.ProjectLike, error) {
	commentsQuery := l.svcCtx.DB.Comment.Query().Where(comment.IsApprovedEQ(true))
	likesQuery := l.svcCtx.DB.ContentInteraction.Query().Where(contentinteraction.KindEQ(contentinteraction.KindLike))
	projectLikesQuery := l.svcCtx.DB.ProjectLike.Query()

	if actor.kind == publicactor.User {
		commentsQuery = commentsQuery.Where(comment.UserIdentityIDEQ(actor.identity.ID))
		likesQuery = likesQuery.Where(contentinteraction.UserIdentityIDEQ(actor.identity.ID))
		projectLikesQuery = projectLikesQuery.Where(projectlike.UserIdentityIDEQ(actor.identity.ID))
	} else {
		// Comment fingerprints are stored inside the user-agent ownership token,
		// so select anonymous rows and compare the complete parsed value below.
		likesQuery = likesQuery.Where(contentinteraction.FingerprintEQ(actor.fingerprint))
		projectLikesQuery = projectLikesQuery.Where(projectlike.FingerprintEQ(actor.fingerprint))
	}

	comments, err := commentsQuery.All(l.ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	if actor.kind == publicactor.Visitor {
		filtered := comments[:0]
		for _, row := range comments {
			if row.UserIdentityID == "" && commentruntime.Fingerprint(row) == actor.fingerprint {
				filtered = append(filtered, row)
			}
		}
		comments = filtered
	}
	likes, err := likesQuery.All(l.ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	projectLikes, err := projectLikesQuery.All(l.ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	if actor.kind == publicactor.Visitor {
		filteredLikes := likes[:0]
		for _, row := range likes {
			if row.UserIdentityID == nil || *row.UserIdentityID == "" {
				filteredLikes = append(filteredLikes, row)
			}
		}
		likes = filteredLikes
		filteredProjectLikes := projectLikes[:0]
		for _, row := range projectLikes {
			if row.UserIdentityID == "" {
				filteredProjectLikes = append(filteredProjectLikes, row)
			}
		}
		projectLikes = filteredProjectLikes
	}
	return comments, likes, projectLikes, nil
}

func (l *GetPublicActorLogic) loadPublicEntitySummaries(events []actorActivity, language string) (map[string]entitySummary, error) {
	idsByType := make(map[string]map[string]struct{})
	for _, event := range events {
		if idsByType[event.entityType] == nil {
			idsByType[event.entityType] = make(map[string]struct{})
		}
		idsByType[event.entityType][event.entityID] = struct{}{}
	}
	ids := func(entityType string) []string {
		values := make([]string, 0, len(idsByType[entityType]))
		for id := range idsByType[entityType] {
			values = append(values, id)
		}
		return values
	}

	summaries := make(map[string]entitySummary)
	if values := ids("moment"); len(values) > 0 {
		rows, err := l.svcCtx.DB.Moment.Query().
			Where(moment.IDIn(values...), moment.VisibilityEQ(moment.VisibilityPublic)).
			WithTranslations().
			All(l.ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			translations := make([][2]string, 0, len(row.Edges.Translations))
			for _, translation := range row.Edges.Translations {
				translations = append(translations, [2]string{translation.LanguageCode, translation.Title})
			}
			title := localizedTitle(row.Title, language, translations...)
			if title == "" {
				if strings.HasPrefix(strings.ToLower(language), "zh") {
					title = "动态"
				} else {
					title = "Moment"
				}
			}
			summaries[entityKey("moment", row.ID)] = entitySummary{row.Slug, title, "/moments/" + row.Slug}
		}
	}
	if values := ids("blog"); len(values) > 0 {
		rows, err := l.svcCtx.DB.BlogPost.Query().Where(
			blogpost.IDIn(values...),
			blogpost.VisibilityEQ(blogpost.VisibilityPublic),
		).WithTranslations().All(l.ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			translations := make([][2]string, 0, len(row.Edges.Translations))
			for _, translation := range row.Edges.Translations {
				translations = append(translations, [2]string{translation.LanguageCode, translation.Title})
			}
			title := localizedTitle(row.Title, language, translations...)
			summaries[entityKey("blog", row.ID)] = entitySummary{row.Slug, title, "/blog/" + row.Slug}
		}
	}
	if values := ids("project"); len(values) > 0 {
		rows, err := l.svcCtx.DB.Project.Query().
			Where(project.IDIn(values...), project.VisibilityEQ(project.VisibilityPublic)).
			WithTranslations().
			All(l.ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			translations := make([][2]string, 0, len(row.Edges.Translations))
			for _, translation := range row.Edges.Translations {
				translations = append(translations, [2]string{translation.LanguageCode, translation.Title})
			}
			title := localizedTitle(row.Title, language, translations...)
			summaries[entityKey("project", row.ID)] = entitySummary{row.Slug, title, "/projects/" + row.Slug}
		}
	}
	if values := ids("episode"); len(values) > 0 {
		rows, err := l.svcCtx.DB.Episode.Query().Where(
			episode.IDIn(values...),
			episode.VisibilityEQ(episode.VisibilityPublic),
		).WithTranslations().All(l.ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			translations := make([][2]string, 0, len(row.Edges.Translations))
			for _, translation := range row.Edges.Translations {
				translations = append(translations, [2]string{translation.LanguageCode, translation.Title})
			}
			title := localizedTitle(row.Title, language, translations...)
			summaries[entityKey("episode", row.ID)] = entitySummary{row.Slug, title, "/episodes/" + row.Slug}
		}
	}
	return summaries, nil
}

func (l *GetPublicActorLogic) buildProfile(
	req *types.PublicActorRequest,
	actor resolvedActor,
	comments []*ent.Comment,
	likes []*ent.ContentInteraction,
	activities []types.PublicActorActivity,
) *types.PublicActorProfile {
	profile := &types.PublicActorProfile{
		ActorID:    req.ActorID,
		Kind:       string(actor.kind),
		Activities: activities,
	}
	if actor.kind == publicactor.User {
		profile.DisplayName = strings.TrimSpace(actor.identity.DisplayName)
		if profile.DisplayName == "" {
			profile.DisplayName = "User"
		}
		profile.AvatarURL = actor.identity.AvatarURL
		profile.JoinedAt = actor.identity.CreatedAt.Format(time.RFC3339)
		return profile
	}

	profile.VisitorNumber = engagementlogic.VisitorNumber(actor.fingerprint)
	if strings.HasPrefix(strings.ToLower(req.Language), "zh") {
		profile.DisplayName = "访客 " + profile.VisitorNumber
	} else {
		profile.DisplayName = "Visitor " + profile.VisitorNumber
	}
	for _, row := range comments {
		if !commentruntime.IsGeneratedGuestName(row.AuthorName) && strings.TrimSpace(row.AuthorName) != "" {
			profile.DisplayName = row.AuthorName
		}
		if profile.CountryCode == "" {
			profile.CountryCode = strings.ToUpper(row.CountryCode)
		}
	}
	for _, row := range likes {
		if profile.CountryCode == "" {
			profile.CountryCode = strings.ToUpper(row.CountryCode)
		}
		if profile.RegionName == "" {
			profile.RegionName = row.RegionName
		}
	}
	if len(activities) > 0 {
		profile.JoinedAt = activities[len(activities)-1].CreatedAt
	}
	return profile
}

func entityKey(entityType, entityID string) string {
	return entityType + ":" + entityID
}

func localizedTitle(base, language string, translations ...[2]string) string {
	wanted := "en"
	if strings.HasPrefix(strings.ToLower(language), "zh") {
		wanted = "zh"
	}
	fallback := strings.TrimSpace(base)
	for _, translation := range translations {
		value := strings.TrimSpace(translation[1])
		if value == "" {
			continue
		}
		code := strings.ToLower(strings.TrimSpace(translation[0]))
		if strings.HasPrefix(code, wanted) {
			return value
		}
		if fallback == "" {
			fallback = value
		}
	}
	return fallback
}
