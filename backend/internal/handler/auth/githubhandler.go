package auth

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"time"

	authn "silan-backend/internal/auth"
	"silan-backend/internal/svc"
)

const (
	githubStateCookie  = "silan_github_oauth_state"
	githubReturnCookie = "silan_github_return_to"
)

func GitHubStartHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		config := svcCtx.Config.Auth
		if config.GitHubClientID == "" || config.GitHubClientSecret == "" || config.GitHubCallbackURL == "" {
			http.Error(w, "GitHub sign-in is not configured", http.StatusServiceUnavailable)
			return
		}
		stateBytes := make([]byte, 24)
		if _, err := rand.Read(stateBytes); err != nil {
			http.Error(w, "Could not start GitHub sign-in", http.StatusInternalServerError)
			return
		}
		state := base64.RawURLEncoding.EncodeToString(stateBytes)
		setOAuthCookie(w, r, githubStateCookie, state, 10*time.Minute)
		setOAuthCookie(w, r, githubReturnCookie, safeReturnPath(r.URL.Query().Get("return_to")), 10*time.Minute)

		parameters := url.Values{
			"client_id":    {config.GitHubClientID},
			"redirect_uri": {config.GitHubCallbackURL},
			"scope":        {"read:user user:email"},
			"state":        {state},
		}
		http.Redirect(w, r, "https://github.com/login/oauth/authorize?"+parameters.Encode(), http.StatusFound)
	}
}

func GitHubCallbackHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stateCookie, stateErr := r.Cookie(githubStateCookie)
		if stateErr != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
			http.Error(w, "Invalid GitHub sign-in state", http.StatusBadRequest)
			return
		}
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "GitHub did not return an authorization code", http.StatusBadRequest)
			return
		}
		config := svcCtx.Config.Auth
		token, err := authn.ExchangeGitHubCode(
			r.Context(), config.GitHubClientID, config.GitHubClientSecret,
			code, config.GitHubCallbackURL,
		)
		if err != nil {
			http.Error(w, "GitHub sign-in failed", http.StatusBadGateway)
			return
		}
		profile, err := authn.FetchGitHubProfile(r.Context(), token)
		if err != nil {
			http.Error(w, "GitHub profile could not be loaded", http.StatusBadGateway)
			return
		}
		if _, err := authn.UpsertGitHubIdentity(r.Context(), svcCtx.DB, profile); err != nil {
			http.Error(w, "GitHub identity could not be saved", http.StatusInternalServerError)
			return
		}
		authn.SetGitHubSessionCookie(w, r, token)
		clearOAuthCookie(w, r, githubStateCookie)

		returnPath := "/moments"
		if cookie, cookieErr := r.Cookie(githubReturnCookie); cookieErr == nil {
			returnPath = safeReturnPath(cookie.Value)
		}
		clearOAuthCookie(w, r, githubReturnCookie)
		http.Redirect(w, r, strings.TrimRight(config.FrontendURL, "/")+returnPath, http.StatusFound)
	}
}

func setOAuthCookie(w http.ResponseWriter, r *http.Request, name, value string, duration time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/api/v1/auth/github",
		MaxAge: int(duration.Seconds()), HttpOnly: true,
		Secure: authn.RequestIsHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
}

func clearOAuthCookie(w http.ResponseWriter, r *http.Request, name string) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Path: "/api/v1/auth/github", MaxAge: -1,
		Expires: time.Unix(1, 0), HttpOnly: true,
		Secure: authn.RequestIsHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
}

func safeReturnPath(value string) string {
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return "/moments"
	}
	return value
}
