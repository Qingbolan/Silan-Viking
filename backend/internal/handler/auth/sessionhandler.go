package auth

import (
	"net/http"

	authn "silan-backend/internal/auth"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func SessionHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, err := authn.SessionIdentity(
			r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID,
		)
		if err != nil {
			httpx.WriteJson(w, http.StatusUnauthorized, map[string]string{
				"code":    "unauthenticated",
				"message": "No active sign-in session",
			})
			return
		}
		httpx.OkJsonCtx(r.Context(), w, map[string]any{
			"id":         identity.ID,
			"email":      identity.Email,
			"name":       identity.DisplayName,
			"avatar_url": identity.AvatarURL,
			"provider":   identity.Provider,
			"verified":   identity.Verified,
		})
	}
}

func LogoutHandler(_ *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authn.ClearSessionCookie(w, r)
		httpx.OkJsonCtx(r.Context(), w, map[string]bool{"ok": true})
	}
}
