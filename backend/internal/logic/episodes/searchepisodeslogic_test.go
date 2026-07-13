package episodes

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	_ "github.com/mattn/go-sqlite3"
)

func TestSearchEpisodesMatchesTranslatedTitleSeriesAndMarkdownBody(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)

	series := client.EpisodeSeries.Create().
		SetID("series-one").
		SetSlug("agent-runtime").
		SetStatus("ongoing").
		SaveX(ctx)
	client.EpisodeSeriesTranslation.Create().
		SetEpisodeSeries(series).
		SetLanguageCode("en").
		SetTitle("Building the runtime").
		SaveX(ctx)
	episode := client.Episode.Create().
		SetID("episode-one").
		SetSeries(series).
		SetSlug("durable-memory").
		SetEpisodeNumber(1).
		SetStatus("published").
		SetVisibility("public").
		SaveX(ctx)
	client.EpisodeTranslation.Create().
		SetEpisode(episode).
		SetLanguageCode("en").
		SetTitle("Durable Memory").
		SetDescription("A practical implementation note").
		SaveX(ctx)
	part := client.ItemPart.Create().
		SetID("episode-part").
		SetPartID("episode-part").
		SetEntityType(itempart.EntityTypeEpisode).
		SetEntityID(episode.ID).
		SetRole("body").
		SetCanonicalLang("en").
		SaveX(ctx)
	client.ItemPartTranslation.Create().
		SetItemPart(part).
		SetLanguageCode("en").
		SetBody("The checkpoint protocol survives process restarts.").
		SaveX(ctx)

	logic := NewSearchEpisodesLogic(ctx, &svc.ServiceContext{DB: client})
	for _, query := range []string{"durable", "runtime", "CHECKPOINT"} {
		response, err := logic.SearchEpisodes(&types.EpisodeSearchRequest{
			Query: query, Language: "en", Page: 1, Size: 10,
		})
		if err != nil {
			t.Fatalf("search %q: %v", query, err)
		}
		if response.Total != 1 || len(response.Episodes) != 1 {
			t.Fatalf("search %q response = %+v", query, response)
		}
		if response.Episodes[0].Slug != "durable-memory" || response.Episodes[0].SeriesSlug != "agent-runtime" {
			t.Fatalf("search %q route data = %+v", query, response.Episodes[0])
		}
	}
}
