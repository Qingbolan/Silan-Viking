package traffic

import (
	"strings"

	"silan-backend/internal/config"
)

type Classifier struct {
	aiUserAgents      []string
	searchUserAgents  []string
	botUserAgents     []BotSignature
	genericBotTokens  []string
	otherBotName      string
	internalReferrers []string
	aiReferrers       []string
	searchReferrers   []string
	socialReferrers   []string
}

type BotSignature struct {
	Token string
	Name  string
}

func NewClassifier(cfg config.TrafficConfig) *Classifier {
	classifier := &Classifier{
		aiUserAgents:      normalizeList(cfg.AIUserAgents),
		searchUserAgents:  normalizeList(cfg.SearchUserAgents),
		botUserAgents:     normalizeBotSignatures(cfg.BotUserAgents),
		genericBotTokens:  normalizeList(cfg.GenericBotTokens),
		otherBotName:      strings.TrimSpace(cfg.OtherBotName),
		internalReferrers: normalizeList(cfg.InternalReferrers),
		aiReferrers:       normalizeList(cfg.AIReferrers),
		searchReferrers:   normalizeList(cfg.SearchReferrers),
		socialReferrers:   normalizeList(cfg.SocialReferrers),
	}
	if classifier.otherBotName == "" {
		classifier.otherBotName = "Other Bot"
	}
	return classifier
}

func (c *Classifier) ClassifyVisitor(userAgent string) (kind string, crawlerName string) {
	ua := strings.ToLower(userAgent)
	if token, ok := firstMatch(ua, c.aiUserAgents); ok {
		return "ai_crawler", token
	}
	if token, ok := firstMatch(ua, c.searchUserAgents); ok {
		return "search_crawler", token
	}
	return "human", ""
}

func (c *Classifier) ClassifyReferrer(referrer string) string {
	ref := strings.ToLower(referrer)
	if ref == "" {
		return "direct"
	}
	if _, ok := firstMatch(ref, c.internalReferrers); ok {
		return "internal"
	}
	if _, ok := firstMatch(ref, c.aiReferrers); ok {
		return "ai_chat"
	}
	if _, ok := firstMatch(ref, c.searchReferrers); ok {
		return "search"
	}
	if _, ok := firstMatch(ref, c.socialReferrers); ok {
		return "social"
	}
	return "direct"
}

func (c *Classifier) DetectBot(userAgent string) (isBot bool, name string) {
	ua := strings.ToLower(userAgent)
	if ua == "" {
		return false, ""
	}
	for _, signature := range c.botUserAgents {
		if strings.Contains(ua, signature.Token) {
			return true, signature.Name
		}
	}
	if _, ok := firstMatch(ua, c.genericBotTokens); ok {
		return true, c.otherBotName
	}
	return false, ""
}

func firstMatch(value string, tokens []string) (string, bool) {
	for _, token := range tokens {
		if strings.Contains(value, token) {
			return token, true
		}
	}
	return "", false
}

func normalizeList(values []string) []string {
	tokens := make([]string, 0, len(values))
	for _, value := range values {
		token := strings.ToLower(strings.TrimSpace(value))
		if token != "" {
			tokens = append(tokens, token)
		}
	}
	return tokens
}

func normalizeBotSignatures(values []config.BotSignatureConfig) []BotSignature {
	signatures := make([]BotSignature, 0, len(values))
	for _, value := range values {
		token := strings.ToLower(strings.TrimSpace(value.Token))
		if token == "" {
			continue
		}
		name := strings.TrimSpace(value.Name)
		if name == "" {
			name = value.Token
		}
		signatures = append(signatures, BotSignature{Token: token, Name: name})
	}
	return signatures
}
