package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/useridentity"
)

const (
	githubTokenURL = "https://github.com/login/oauth/access_token"
	githubAPIURL   = "https://api.github.com"
)

type GitHubProfile struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func ExchangeGitHubCode(ctx context.Context, clientID, clientSecret, code, redirectURI string) (string, error) {
	payload, err := json.Marshal(map[string]string{
		"client_id": clientID, "client_secret": clientSecret,
		"code": code, "redirect_uri": redirectURI,
	})
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, githubTokenURL, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("exchange GitHub code: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var result struct {
		AccessToken      string `json:"access_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if response.StatusCode != http.StatusOK || result.AccessToken == "" {
		return "", fmt.Errorf("GitHub token exchange failed: %s %s", result.Error, result.ErrorDescription)
	}
	return result.AccessToken, nil
}

func FetchGitHubProfile(ctx context.Context, accessToken string) (*GitHubProfile, error) {
	profile := &GitHubProfile{}
	if err := githubAPIGet(ctx, accessToken, "/user", profile); err != nil {
		return nil, err
	}
	if profile.Email == "" {
		var emails []githubEmail
		if err := githubAPIGet(ctx, accessToken, "/user/emails", &emails); err == nil {
			for _, email := range emails {
				if email.Primary && email.Verified {
					profile.Email = email.Email
					break
				}
			}
		}
	}
	if profile.ID == 0 || profile.Login == "" {
		return nil, fmt.Errorf("GitHub profile is missing a stable identity")
	}
	return profile, nil
}

func githubAPIGet(ctx context.Context, accessToken, path string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, githubAPIURL+path, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("GitHub API request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("GitHub API returned %d", response.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(target)
}

func UpsertGitHubIdentity(ctx context.Context, db *ent.Client, profile *GitHubProfile) (*ent.UserIdentity, error) {
	externalID := strconv.FormatInt(profile.ID, 10)
	existing, err := db.UserIdentity.Query().Where(
		useridentity.ProviderEQ("github"),
		useridentity.ExternalIDEQ(externalID),
	).First(ctx)
	displayName := profile.Name
	if displayName == "" {
		displayName = profile.Login
	}
	email := profile.Email
	if email == "" {
		email = profile.Login + "@users.noreply.github.com"
	}
	if err == nil {
		update := existing.Update().SetDisplayName(displayName).SetAvatarURL(profile.AvatarURL).SetVerified(true)
		update.SetEmail(email)
		return update.Save(ctx)
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	create := db.UserIdentity.Create().
		SetID(NewUserID()).
		SetProvider("github").
		SetExternalID(externalID).
		SetDisplayName(displayName).
		SetAvatarURL(profile.AvatarURL).
		SetEmail(email).
		SetVerified(true)
	return create.Save(ctx)
}
