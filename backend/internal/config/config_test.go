package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/zeromicro/go-zero/core/conf"
)

func TestLoadConfigFromEnvOverridesMediaRoot(t *testing.T) {
	t.Setenv("MEDIA_ROOT", "/tmp/silan-media")

	cfg := Config{Media: MediaConfig{Root: "/configured/media"}}
	cfg.LoadConfigFromEnv()

	if got, want := cfg.MediaRoot(), "/tmp/silan-media"; got != want {
		t.Fatalf("MediaRoot() = %q, want %q", got, want)
	}
}

func TestMediaRootUsesDeployDefault(t *testing.T) {
	cfg := Config{}
	if got, want := cfg.MediaRoot(), "/data/media"; got != want {
		t.Fatalf("MediaRoot() = %q, want %q", got, want)
	}
}

func TestLoadConfigFromEnvOverridesTrafficRules(t *testing.T) {
	t.Setenv("TRAFFIC_AI_USER_AGENTS", "future-ai-fetcher, another-ai")
	t.Setenv("TRAFFIC_BOT_USER_AGENTS", "future-ai-fetcher=FutureAI,genericbot=GenericBot")

	cfg := Config{}
	cfg.LoadConfigFromEnv()

	if got, want := cfg.Traffic.AIUserAgents[0], "future-ai-fetcher"; got != want {
		t.Fatalf("AIUserAgents[0] = %q, want %q", got, want)
	}
	if got, want := cfg.Traffic.BotUserAgents[0].Name, "FutureAI"; got != want {
		t.Fatalf("BotUserAgents[0].Name = %q, want %q", got, want)
	}
}

func TestConfigLoadsTrafficRulesFromYAML(t *testing.T) {
	path := filepath.Join(t.TempDir(), "backend-api.yaml")
	if err := os.WriteFile(path, []byte(`
Name: backend-api
Host: 127.0.0.1
Port: 5200
Database:
  driver: sqlite3
  source: ':memory:'
  host: ''
  port: ''
  user: ''
  password: ''
  name: ''
  ssl_mode: ''
Auth:
  google_client_id: ''
Media:
  Root: /tmp/media
Traffic:
  ai_user_agents:
    - future-ai-fetcher
  bot_user_agents:
    - { token: future-ai-fetcher, name: FutureAI }
  ai_referrers:
    - answer.example
`), 0o600); err != nil {
		t.Fatal(err)
	}

	var cfg Config
	conf.MustLoad(path, &cfg)

	if got, want := cfg.Traffic.AIUserAgents[0], "future-ai-fetcher"; got != want {
		t.Fatalf("AIUserAgents[0] = %q, want %q", got, want)
	}
	if got, want := cfg.Traffic.BotUserAgents[0].Name, "FutureAI"; got != want {
		t.Fatalf("BotUserAgents[0].Name = %q, want %q", got, want)
	}
	if got, want := cfg.Traffic.AIReferrers[0], "answer.example"; got != want {
		t.Fatalf("AIReferrers[0] = %q, want %q", got, want)
	}
}
