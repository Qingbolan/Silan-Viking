package episodes

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/episodes"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func GetEpisodeSeriesListHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.EpisodeSeriesListRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := episodes.NewGetEpisodeSeriesListLogic(r.Context(), svcCtx)
		resp, err := l.GetEpisodeSeriesList(req.Language)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
