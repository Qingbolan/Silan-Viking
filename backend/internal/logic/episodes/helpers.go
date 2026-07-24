package episodes

import (
	"context"
	"fmt"

	"entgo.io/ent/dialect/sql"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/episode"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// resolveLang normalizes an empty language to the default ("en").
func resolveLang(lang string) string {
	if lang == "" {
		return "en"
	}
	return lang
}

// episodePartBody fetches an episode's prose body for a given Part role and
// language. The content engine stores Part bodies in item_part_translation
// (keyed by the episode's item_part rows), not in the episodes table — so the
// detail endpoint reads them here. It prefers the requested language, then
// "en", then any. Returns "" when the episode has no synced body for that role.
func episodePartBody(ctx context.Context, svcCtx *svc.ServiceContext, episodeID, role, lang string) string {
	part, err := svcCtx.DB.ItemPart.Query().
		Where(
			itempart.EntityTypeEQ(itempart.EntityTypeEpisode),
			itempart.EntityIDEQ(episodeID),
			itempart.Role(role),
		).
		WithTranslations().
		First(ctx)
	if err != nil || part == nil {
		return ""
	}
	trs := part.Edges.Translations
	by := func(code string) string {
		for _, t := range trs {
			if t.LanguageCode == code && t.Body != "" {
				return t.Body
			}
		}
		return ""
	}
	if b := by(resolveLang(lang)); b != "" {
		return b
	}
	if b := by("en"); b != "" {
		return b
	}
	for _, t := range trs {
		if t.Body != "" {
			return t.Body
		}
	}
	return ""
}

func publicEpisodeQuery(q *ent.EpisodeQuery) {
	q.Where(
		episode.StatusEQ(episode.StatusPublished),
		episode.VisibilityEQ(episode.VisibilityPublic),
	).
		WithTranslations().
		Order(episode.ByEpisodeNumber(sql.OrderAsc()))
}

func episodeToData(ep *ent.Episode, language string) types.EpisodeData {
	language = resolveLang(language)
	title := ep.Title
	description := ""
	pick := func(code string) *ent.EpisodeTranslation {
		for _, translation := range ep.Edges.Translations {
			if translation.LanguageCode == code {
				return translation
			}
		}
		return nil
	}
	translation := pick(language)
	if translation == nil {
		translation = pick("en")
	}
	if translation == nil && len(ep.Edges.Translations) > 0 {
		translation = ep.Edges.Translations[0]
	}
	if translation != nil {
		if translation.Title != "" {
			title = translation.Title
		}
		if translation.Description != nil {
			description = *translation.Description
		}
	}

	// `published_at` is a plain date string (nillable).
	var publishDate string
	if ep.PublishedAt != nil {
		publishDate = *ep.PublishedAt
	}

	var duration int
	if ep.DurationMinutes != nil {
		duration = *ep.DurationMinutes
	}

	var seriesSlug string
	if ep.Edges.Series != nil {
		seriesSlug = ep.Edges.Series.Slug
	}

	content := []types.BlogContent{}
	if description != "" {
		content = append(content, types.BlogContent{
			ID:       fmt.Sprintf("%s-description", ep.ID),
			Type:     "markdown",
			Content:  description,
			Language: language,
		})
	}

	return types.EpisodeData{
		ID:              ep.ID,
		SeriesID:        ep.SeriesID,
		SeriesSlug:      seriesSlug,
		Slug:            ep.Slug,
		Title:           title,
		Description:     description,
		EpisodeNumber:   ep.EpisodeNumber,
		Status:          string(ep.Status),
		Visibility:      string(ep.Visibility),
		PublishDate:     publishDate,
		UpdatedAt:       ep.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		DurationMinutes: duration,
		Content:         content,
	}
}

func seriesToData(series *ent.EpisodeSeries, language string) types.EpisodeSeriesData {
	language = resolveLang(language)
	title := series.Title
	description := ""
	if series.Description != nil {
		description = *series.Description
	}
	coverURL := ""
	if series.CoverURL != nil {
		coverURL = *series.CoverURL
	}
	pick := func(code string) *ent.EpisodeSeriesTranslation {
		for _, translation := range series.Edges.Translations {
			if translation.LanguageCode == code {
				return translation
			}
		}
		return nil
	}
	translation := pick(language)
	if translation == nil {
		translation = pick("en")
	}
	if translation == nil && len(series.Edges.Translations) > 0 {
		translation = series.Edges.Translations[0]
	}
	if translation != nil {
		if translation.Title != "" {
			title = translation.Title
		}
		if translation.Description != nil {
			description = *translation.Description
		}
	}

	episodes := make([]types.EpisodeData, 0, len(series.Edges.Episodes))
	for _, ep := range series.Edges.Episodes {
		data := episodeToData(ep, language)
		data.SeriesSlug = series.Slug
		episodes = append(episodes, data)
	}

	return types.EpisodeSeriesData{
		ID:          series.ID,
		Slug:        series.Slug,
		Title:       title,
		Description: description,
		CoverURL:    coverURL,
		Status:      string(series.Status),
		Episodes:    episodes,
		CreatedAt:   series.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   series.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
