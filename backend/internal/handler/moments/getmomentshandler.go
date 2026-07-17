package moments

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/moments"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func GetMomentsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.MomentListRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := moments.NewGetMomentsLogic(r.Context(), svcCtx)
		resp, err := l.GetMoments(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
