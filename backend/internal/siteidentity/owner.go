// Package siteidentity resolves the single-owner identity projected from the
// résumé. Content rows intentionally do not duplicate author fields.
package siteidentity

import (
	"context"

	"silan-backend/internal/ent"
)

// OwnerName returns the localized site-owner name, preferring the requested
// language, then English, then any available translation. An installation
// without résumé identity data returns an empty name without inventing one.
func OwnerName(ctx context.Context, client *ent.Client, language string) (string, error) {
	owner, err := client.PersonalInfo.Query().WithTranslations().First(ctx)
	if ent.IsNotFound(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if language == "" {
		language = "en"
	}
	pick := func(code string) *ent.PersonalInfoTranslation {
		for _, translation := range owner.Edges.Translations {
			if translation.LanguageCode == code {
				return translation
			}
		}
		return nil
	}
	translation := pick(language)
	if translation == nil {
		translation = pick("en")
	}
	if translation == nil && len(owner.Edges.Translations) > 0 {
		translation = owner.Edges.Translations[0]
	}
	if translation != nil && translation.FullName != "" {
		return translation.FullName, nil
	}
	return owner.FullName, nil
}
