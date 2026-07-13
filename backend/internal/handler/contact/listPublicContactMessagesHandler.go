package contact

import (
	"net/http"

	contactlogic "silan-backend/internal/logic/contact"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func ListPublicContactMessagesHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logic := contactlogic.NewMessageLogic(r.Context(), svcCtx)
		resp, err := logic.ListPublic()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
