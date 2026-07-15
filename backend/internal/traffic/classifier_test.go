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
