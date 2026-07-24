package auth

import (
	"net/http"

	authn "silan-backend/internal/auth"
	"silan-backend/internal/commentruntime"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func MergeGuestIdentityHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.MergeGuestIdentityRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

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

		result, err := commentruntime.MergeGuestIntoIdentity(r.Context(), svcCtx.DB, req.Fingerprint, identity)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		httpx.OkJsonCtx(r.Context(), w, types.MergeGuestIdentityResponse{
			ID:             identity.ID,
			Email:          identity.Email,
			Name:           identity.DisplayName,
			AvatarURL:      identity.AvatarURL,
			Provider:       identity.Provider,
			Verified:       identity.Verified,
			MergedComments: result.Comments,
			MergedLikes: result.CommentLikes + result.ProjectLikes +
				result.ContentLikes,
			DedupedLikes: result.DedupedCommentLikes + result.DedupedProjectLikes +
				result.DedupedContentLikes,
		})
	}
}
