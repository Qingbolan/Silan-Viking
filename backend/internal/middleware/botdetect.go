package middleware

import "strings"

// botSignatures maps a lower-cased User-Agent substring to a canonical
// crawler name. Covers the major search engines and the social-platform
// scrapers that fetch Open Graph / Twitter Card metadata.
var botSignatures = []struct {
	token string
	name  string
}{
	{"googlebot", "Googlebot"},
	{"google-inspectiontool", "Googlebot"},
	{"storebot-google", "Googlebot"},
	{"bingbot", "Bingbot"},
	{"slurp", "Yahoo Slurp"},
	{"duckduckbot", "DuckDuckBot"},
	{"baiduspider", "Baiduspider"},
	{"yandexbot", "YandexBot"},
	{"sogou", "Sogou Spider"},
	{"bytespider", "Bytespider"},
	{"applebot", "Applebot"},
	{"facebookexternalhit", "Facebook"},
	{"facebot", "Facebook"},
	{"twitterbot", "Twitterbot"},
	{"linkedinbot", "LinkedInBot"},
	{"slackbot", "Slackbot"},
	{"telegrambot", "TelegramBot"},
	{"whatsapp", "WhatsApp"},
	{"discordbot", "Discordbot"},
	{"pinterest", "Pinterest"},
	{"mj12bot", "MJ12bot"},
	{"ahrefsbot", "AhrefsBot"},
	{"semrushbot", "SemrushBot"},
	{"petalbot", "PetalBot"},
	{"gptbot", "GPTBot"},
	{"oai-searchbot", "OAI-SearchBot"},
	{"chatgpt-user", "ChatGPT-User"},
	{"claudebot", "ClaudeBot"},
	{"perplexitybot", "PerplexityBot"},
	{"ccbot", "CCBot"},
}

// detectBot inspects a User-Agent string and reports whether it belongs to
// a known crawler, along with the crawler's canonical name. A generic UA
// that merely contains "bot"/"crawler"/"spider" is also flagged, but with
// the name "Other Bot".
func detectBot(userAgent string) (isBot bool, name string) {
	if userAgent == "" {
		return false, ""
	}
	ua := strings.ToLower(userAgent)
	for _, sig := range botSignatures {
		if strings.Contains(ua, sig.token) {
			return true, sig.name
		}
	}
	if strings.Contains(ua, "bot") ||
		strings.Contains(ua, "crawler") ||
		strings.Contains(ua, "spider") {
		return true, "Other Bot"
	}
	return false, ""
}
