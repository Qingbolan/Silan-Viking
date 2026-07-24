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

// BotCategory is the analytics ownership of a detected automated user agent.
// Only AI and search crawlers become content interactions; Other bots remain
// visible in the access log without being mislabeled as SEO traffic.
type BotCategory string

const (
	BotCategoryNone   BotCategory = ""
	BotCategoryAI     BotCategory = "ai"
	BotCategorySearch BotCategory = "search"
	BotCategoryOther  BotCategory = "other"
)

// UserAgentClassification is the single classification result shared by
// content analytics and the raw crawler access log.
type UserAgentClassification struct {
	Category    BotCategory
	CrawlerName string
}

func (classification UserAgentClassification) IsBot() bool {
	return classification.Category != BotCategoryNone
}

func (classification UserAgentClassification) VisitorKind() (string, bool) {
	switch classification.Category {
	case BotCategoryAI:
		return "ai_crawler", true
	case BotCategorySearch:
		return "search_crawler", true
	default:
		return "", false
	}
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

// ClassifyUserAgent owns all user-agent matching. The category lists decide
// whether a bot is GEO/SEO discovery traffic, while the signature catalogue
// supplies canonical display names and recognizes non-discovery bots.
func (c *Classifier) ClassifyUserAgent(userAgent string) UserAgentClassification {
	ua := strings.ToLower(strings.TrimSpace(userAgent))
	if ua == "" {
		return UserAgentClassification{}
	}
	if token, ok := firstMatch(ua, c.aiUserAgents); ok {
		return UserAgentClassification{
			Category:    BotCategoryAI,
			CrawlerName: c.canonicalBotName(ua, token),
		}
	}
	if token, ok := firstMatch(ua, c.searchUserAgents); ok {
		return UserAgentClassification{
			Category:    BotCategorySearch,
			CrawlerName: c.canonicalBotName(ua, token),
		}
	}
	for _, signature := range c.botUserAgents {
		if strings.Contains(ua, signature.Token) {
			return UserAgentClassification{
				Category:    BotCategoryOther,
				CrawlerName: signature.Name,
			}
		}
	}
	if _, ok := firstMatch(ua, c.genericBotTokens); ok {
		return UserAgentClassification{
			Category:    BotCategoryOther,
			CrawlerName: c.otherBotName,
		}
	}
	return UserAgentClassification{}
}

func (c *Classifier) ClassifyVisitor(userAgent string) (kind string, crawlerName string) {
	classification := c.ClassifyUserAgent(userAgent)
	if kind, ok := classification.VisitorKind(); ok {
		return kind, classification.CrawlerName
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
	classification := c.ClassifyUserAgent(userAgent)
	return classification.IsBot(), classification.CrawlerName
}

func (c *Classifier) canonicalBotName(userAgent, fallback string) string {
	for _, signature := range c.botUserAgents {
		if strings.Contains(userAgent, signature.Token) {
			return signature.Name
		}
	}
	return fallback
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
