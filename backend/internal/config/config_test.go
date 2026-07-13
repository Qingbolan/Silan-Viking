package config

import "testing"

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
