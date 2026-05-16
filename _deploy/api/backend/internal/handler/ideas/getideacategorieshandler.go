package ideas

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/ideas"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Get idea categories
func GetIdeaCategoriesHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.IdeaCategoriesRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := ideas.NewGetIdeaCategoriesLogic(r.Context(), svcCtx)
		resp, err := l.GetIdeaCategories(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
