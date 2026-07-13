package contact

import (
	"net/http"

	authn "silan-backend/internal/auth"
	contactlogic "silan-backend/internal/logic/contact"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func CreateContactMessageHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.CreateContactMessageRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		logic := contactlogic.NewMessageLogic(r.Context(), svcCtx)
		resp, err := logic.Create(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
