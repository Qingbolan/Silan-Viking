package traffic

import (
	"testing"

	"silan-backend/internal/config"
)

func TestClassifierReadsAICrawlerTokensFromConfig(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		AIUserAgents:     []string{"future-ai-fetcher"},
		SearchUserAgents: []string{"googlebot"},
	})

	kind, crawler := classifier.ClassifyVisitor("Mozilla/5.0 Future-AI-Fetcher/1.0")

	if kind != "ai_crawler" {
		t.Fatalf("kind = %q, want ai_crawler", kind)
	}
	if crawler != "future-ai-fetcher" {
		t.Fatalf("crawler = %q, want configured token", crawler)
	}
}

func TestClassifierDetectsBotFromConfiguredSignatures(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		BotUserAgents: []config.BotSignatureConfig{
			{Token: "future-ai-fetcher", Name: "FutureAI"},
		},
		GenericBotTokens: []string{"crawler"},
		OtherBotName:     "Other Crawler",
	})

	isBot, name := classifier.DetectBot("Future-AI-Fetcher/1.0")
	if !isBot || name != "FutureAI" {
		t.Fatalf("DetectBot configured signature = (%v, %q), want (true, FutureAI)", isBot, name)
	}

	isBot, name = classifier.DetectBot("Mozilla/5.0 generic crawler")
	if !isBot || name != "Other Crawler" {
		t.Fatalf("DetectBot generic = (%v, %q), want (true, Other Crawler)", isBot, name)
	}
}

func TestClassifierUsesOneCanonicalResultForDiscoveryBots(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		AIUserAgents: []string{"claude-user"},
		BotUserAgents: []config.BotSignatureConfig{
			{Token: "claude-user", Name: "Claude-User"},
		},
	})

	classification := classifier.ClassifyUserAgent("Mozilla/5.0 Claude-User/1.0")
	if classification.Category != BotCategoryAI {
		t.Fatalf("category = %q, want %q", classification.Category, BotCategoryAI)
	}
	if classification.CrawlerName != "Claude-User" {
		t.Fatalf("crawler name = %q, want Claude-User", classification.CrawlerName)
	}
	if kind, name := classifier.ClassifyVisitor("Claude-User/1.0"); kind != "ai_crawler" || name != "Claude-User" {
		t.Fatalf("ClassifyVisitor = (%q, %q), want (ai_crawler, Claude-User)", kind, name)
	}
	if isBot, name := classifier.DetectBot("Claude-User/1.0"); !isBot || name != "Claude-User" {
		t.Fatalf("DetectBot = (%v, %q), want (true, Claude-User)", isBot, name)
	}
}

func TestClassifierRecognizesChineseAICrawlerFamilies(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		AIUserAgents: []string{
			"deepseekbot",
			"doubaobot",
			"doubao-user",
			"bytespider",
			"kimibot",
			"kimi-user",
			"kimi-searchbot",
			"chatglm-spider",
		},
		BotUserAgents: []config.BotSignatureConfig{
			{Token: "deepseekbot", Name: "DeepSeekBot"},
			{Token: "doubaobot", Name: "DoubaoBot"},
			{Token: "doubao-user", Name: "Doubao-User"},
			{Token: "bytespider", Name: "ByteDance Bytespider"},
			{Token: "kimibot", Name: "KimiBot"},
			{Token: "kimi-user", Name: "Kimi-User"},
			{Token: "kimi-searchbot", Name: "Kimi-SearchBot"},
			{Token: "chatglm-spider", Name: "ChatGLM-Spider"},
		},
	})

	cases := map[string]string{
		"Mozilla/5.0 (compatible; DeepSeekBot/1.0)":    "DeepSeekBot",
		"Mozilla/5.0 (compatible; Doubaobot/1.0)":      "DoubaoBot",
		"Mozilla/5.0 (compatible; Doubao-User/1.0)":    "Doubao-User",
		"Mozilla/5.0 (compatible; Bytespider)":         "ByteDance Bytespider",
		"Mozilla/5.0 (compatible; KimiBot/1.0)":        "KimiBot",
		"Mozilla/5.0 (compatible; Kimi-User/1.0)":      "Kimi-User",
		"Mozilla/5.0 (compatible; Kimi-SearchBot/1.0)": "Kimi-SearchBot",
		"Mozilla/5.0 (compatible; ChatGLM-Spider/1.0)": "ChatGLM-Spider",
	}
	for userAgent, wantName := range cases {
		kind, name := classifier.ClassifyVisitor(userAgent)
		if kind != "ai_crawler" || name != wantName {
			t.Errorf("ClassifyVisitor(%q) = (%q, %q), want (ai_crawler, %q)", userAgent, kind, name, wantName)
		}
	}
}

func TestClassifierKeepsGenericBotsOutOfSEO(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		BotUserAgents:    []config.BotSignatureConfig{{Token: "slackbot", Name: "Slackbot"}},
		GenericBotTokens: []string{"bot", "crawler", "spider"},
	})

	classification := classifier.ClassifyUserAgent("Slackbot-LinkExpanding 1.0")
	if classification.Category != BotCategoryOther {
		t.Fatalf("category = %q, want %q", classification.Category, BotCategoryOther)
	}
	if kind, crawler := classifier.ClassifyVisitor("Slackbot-LinkExpanding 1.0"); kind != "human" || crawler != "" {
		t.Fatalf("ClassifyVisitor = (%q, %q), want public non-discovery fallback", kind, crawler)
	}
	if isBot, name := classifier.DetectBot("Slackbot-LinkExpanding 1.0"); !isBot || name != "Slackbot" {
		t.Fatalf("DetectBot = (%v, %q), want (true, Slackbot)", isBot, name)
	}
}

func TestClassifierReadsAIReferrersFromConfig(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		AIReferrers:       []string{"answer.example"},
		InternalReferrers: []string{"silan.tech"},
	})

	if got := classifier.ClassifyReferrer("https://answer.example/thread/1"); got != "ai_chat" {
		t.Fatalf("ClassifyReferrer = %q, want ai_chat", got)
	}
	if got := classifier.ClassifyReferrer("https://silan.tech/blog"); got != "internal" {
		t.Fatalf("ClassifyReferrer internal = %q, want internal", got)
	}
}

func TestClassifierRecognizesChineseAIReferrers(t *testing.T) {
	classifier := NewClassifier(config.TrafficConfig{
		AIReferrers: []string{
			"deepseek.com",
			"doubao.com",
			"kimi.com",
			"chatglm.cn",
			"chat.z.ai",
		},
	})

	for _, referrer := range []string{
		"https://chat.deepseek.com/a/chat/s/example",
		"https://www.doubao.com/chat/",
		"https://www.kimi.com/chat/example",
		"https://chatglm.cn/main/alltoolsdetail",
		"https://chat.z.ai/c/example",
	} {
		if got := classifier.ClassifyReferrer(referrer); got != "ai_chat" {
			t.Errorf("ClassifyReferrer(%q) = %q, want ai_chat", referrer, got)
		}
	}
}
