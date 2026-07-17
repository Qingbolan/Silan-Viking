package updates

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
	updateslogic "silan-backend/internal/logic/updates"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"
)

func GetEngagementHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.UpdateRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := updateslogic.UpdateEngagement(r.Context(), svcCtx, req.Slug, r.URL.Query().Get("fingerprint"), authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID))
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}

func ToggleLikeHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.LikeProjectRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.ClientIP, req.UserAgentFull, req.Referrer = utils.GetClientIP(r), utils.GetUserAgent(r), r.Referer()
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)
		resp, err := updateslogic.ToggleUpdateLike(r.Context(), svcCtx, &req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}

func ListCommentsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.UpdateRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := updateslogic.ListUpdateComments(r.Context(), svcCtx, req.Slug, r.URL.Query().Get("fingerprint"), authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID))
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}

func CreateCommentHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.CreateIdeaCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.ClientIP, req.UserAgentFull = utils.GetClientIP(r), utils.GetUserAgent(r)
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)
		resp, err := updateslogic.CreateUpdateComment(r.Context(), svcCtx, &req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}

func ToggleCommentLikeHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.LikeCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.ClientIP, req.UserAgentFull = utils.GetClientIP(r), utils.GetUserAgent(r)
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)
		resp, err := updateslogic.ToggleUpdateCommentLike(r.Context(), svcCtx, &req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}

func DeleteCommentHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.DeleteIdeaCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		err := updateslogic.DeleteUpdateComment(r.Context(), svcCtx, req.CommentID, req.Fingerprint, authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID))
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, map[string]any{"ok": true})
	}
}
