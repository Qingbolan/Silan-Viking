package episodes

import (
	"fmt"

	"entgo.io/ent/dialect/sql"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/episode"
	"silan-backend/internal/types"
)

func publicEpisodeQuery(q *ent.EpisodeQuery) {
	q.Where(
		episode.StatusEQ(episode.StatusPublished),
		episode.VisibilityEQ(episode.VisibilityPublic),
	).
		WithTranslations().
		Order(episode.ByEpisodeNumber(sql.OrderAsc()))
}

func episodeToData(ep *ent.Episode, language string) types.EpisodeData {
	title := ep.Title
	description := ""
	for _, translation := range ep.Edges.Translations {
		if translation.LanguageCode == language {
			title = translation.Title
			if translation.Description != nil {
				description = *translation.Description
			}
			break
		}
	}

	var publishDate string
	if ep.PublishedAt != nil {
		publishDate = ep.PublishedAt.Format("2006-01-02")
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
			ID:       fmt.Sprintf("%s-description", ep.ID.String()),
			Type:     "markdown",
			Content:  description,
			Language: language,
		})
	}

	return types.EpisodeData{
		ID:              ep.ID.String(),
		SeriesID:        ep.SeriesID.String(),
		SeriesSlug:      seriesSlug,
		Slug:            ep.Slug,
		Title:           title,
		Description:     description,
		EpisodeNumber:   ep.EpisodeNumber,
		Status:          string(ep.Status),
		Visibility:      string(ep.Visibility),
		PublishDate:     publishDate,
		DurationMinutes: duration,
		Content:         content,
	}
}

func seriesToData(series *ent.EpisodeSeries, language string) types.EpisodeSeriesData {
	title := series.Title
	description := ""
	if series.Description != nil {
		description = *series.Description
	}
	for _, translation := range series.Edges.Translations {
		if translation.LanguageCode == language {
			title = translation.Title
			if translation.Description != nil {
				description = *translation.Description
			}
			break
		}
	}

	episodes := make([]types.EpisodeData, 0, len(series.Edges.Episodes))
	for _, ep := range series.Edges.Episodes {
		data := episodeToData(ep, language)
		data.SeriesSlug = series.Slug
		episodes = append(episodes, data)
	}

	return types.EpisodeSeriesData{
		ID:          series.ID.String(),
		Slug:        series.Slug,
		Title:       title,
		Description: description,
		Status:      string(series.Status),
		Episodes:    episodes,
		CreatedAt:   series.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   series.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
