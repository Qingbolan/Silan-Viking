package resume

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/resume"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"
)

// Get complete resume data
func GetResumeDataHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ResumeRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.ClientIP = utils.GetClientIP(r)
		req.UserAgentFull = utils.GetUserAgent(r)
		if req.Referrer == "" {
			req.Referrer = r.Referer()
		}

		l := resume.NewGetResumeDataLogic(r.Context(), svcCtx)
		resp, err := l.GetResumeData(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
