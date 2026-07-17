package config

import (
	"os"
	"strings"

	"github.com/zeromicro/go-zero/rest"
)

type Config struct {
	rest.RestConf
	Database DatabaseConfig `json:"database"`
	Auth     AuthConfig     `json:"auth"`
	Media    MediaConfig    `json:"media"`
	Security SecurityConfig `json:"security,optional"`
	Traffic  TrafficConfig  `json:"traffic,optional"`
}

// SecurityConfig holds machine-to-machine credentials. Values are injected at
// runtime and must not be committed to the YAML configuration.
type SecurityConfig struct {
	StatsSyncToken string `json:"stats_sync_token,env=STATS_SYNC_TOKEN,optional"`
}

// MediaConfig locates the binary resource files the media endpoint serves.
type MediaConfig struct {
	// Root is the directory the `assets/` content resources are deployed
	// into. Optional in the config file; defaults to `/data/media` (the
	// path the Docker deploy mounts the media volume at) when left blank.
	Root string `json:"root,env=MEDIA_ROOT,optional"`
}

// MediaRoot returns the configured media directory, or the deploy default.
func (c *Config) MediaRoot() string {
	if c.Media.Root != "" {
		return c.Media.Root
	}
	return "/data/media"
}

type DatabaseConfig struct {
	Driver   string `json:"driver,env=DB_DRIVER"`
	Source   string `json:"source,env=DB_SOURCE"`
	Host     string `json:"host,env=DB_HOST"`
	Port     string `json:"port,env=DB_PORT"`
	User     string `json:"user,env=DB_USER"`
	Password string `json:"password,env=DB_PASSWORD"`
	Name     string `json:"name,env=DB_NAME"`
	SSLMode  string `json:"ssl_mode,env=DB_SSL_MODE"`
}

type BotSignatureConfig struct {
	Token string `json:"token"`
	Name  string `json:"name"`
}

type TrafficConfig struct {
	AIUserAgents      []string             `json:"ai_user_agents,env=TRAFFIC_AI_USER_AGENTS,optional"`
	SearchUserAgents  []string             `json:"search_user_agents,env=TRAFFIC_SEARCH_USER_AGENTS,optional"`
	BotUserAgents     []BotSignatureConfig `json:"bot_user_agents,optional"`
	GenericBotTokens  []string             `json:"generic_bot_tokens,env=TRAFFIC_GENERIC_BOT_TOKENS,optional"`
	OtherBotName      string               `json:"other_bot_name,env=TRAFFIC_OTHER_BOT_NAME,optional"`
	InternalReferrers []string             `json:"internal_referrers,env=TRAFFIC_INTERNAL_REFERRERS,optional"`
	AIReferrers       []string             `json:"ai_referrers,env=TRAFFIC_AI_REFERRERS,optional"`
	SearchReferrers   []string             `json:"search_referrers,env=TRAFFIC_SEARCH_REFERRERS,optional"`
	SocialReferrers   []string             `json:"social_referrers,env=TRAFFIC_SOCIAL_REFERRERS,optional"`
}

// AuthConfig holds authentication-related settings
type AuthConfig struct {
	GoogleClientID string `json:"google_client_id,env=GOOGLE_CLIENT_ID"`
}

// LoadConfigFromEnv loads configuration from environment variables
func (c *Config) LoadConfigFromEnv() {
	// Load database config from environment if set
	if driver := os.Getenv("DB_DRIVER"); driver != "" {
		c.Database.Driver = driver
	}
	if source := os.Getenv("DB_SOURCE"); source != "" {
		c.Database.Source = source
	}
	if host := os.Getenv("DB_HOST"); host != "" {
		c.Database.Host = host
	}
	if port := os.Getenv("DB_PORT"); port != "" {
		c.Database.Port = port
	}
	if user := os.Getenv("DB_USER"); user != "" {
		c.Database.User = user
	}
	if password := os.Getenv("DB_PASSWORD"); password != "" {
		c.Database.Password = password
	}
	if name := os.Getenv("DB_NAME"); name != "" {
		c.Database.Name = name
	}
	if sslMode := os.Getenv("DB_SSL_MODE"); sslMode != "" {
		c.Database.SSLMode = sslMode
	}

	// Auth configuration from env
	if googleID := os.Getenv("GOOGLE_CLIENT_ID"); googleID != "" {
		c.Auth.GoogleClientID = googleID
	}
	if mediaRoot := os.Getenv("MEDIA_ROOT"); mediaRoot != "" {
		c.Media.Root = mediaRoot
	}
	if token := os.Getenv("STATS_SYNC_TOKEN"); token != "" {
		c.Security.StatsSyncToken = token
	}
	if value := os.Getenv("TRAFFIC_AI_USER_AGENTS"); value != "" {
		c.Traffic.AIUserAgents = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_SEARCH_USER_AGENTS"); value != "" {
		c.Traffic.SearchUserAgents = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_GENERIC_BOT_TOKENS"); value != "" {
		c.Traffic.GenericBotTokens = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_OTHER_BOT_NAME"); value != "" {
		c.Traffic.OtherBotName = value
	}
	if value := os.Getenv("TRAFFIC_INTERNAL_REFERRERS"); value != "" {
		c.Traffic.InternalReferrers = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_AI_REFERRERS"); value != "" {
		c.Traffic.AIReferrers = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_SEARCH_REFERRERS"); value != "" {
		c.Traffic.SearchReferrers = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_SOCIAL_REFERRERS"); value != "" {
		c.Traffic.SocialReferrers = csvList(value)
	}
	if value := os.Getenv("TRAFFIC_BOT_USER_AGENTS"); value != "" {
		c.Traffic.BotUserAgents = botSignatureList(value)
	}

	// Auto-generate connection string if individual components are provided
	if c.Database.Source == "" && c.Database.Host != "" {
		c.Database.Source = c.buildConnectionString()
	}
}

func csvList(value string) []string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			items = append(items, item)
		}
	}
	return items
}

func botSignatureList(value string) []BotSignatureConfig {
	parts := strings.Split(value, ",")
	items := make([]BotSignatureConfig, 0, len(parts))
	for _, part := range parts {
		pair := strings.SplitN(part, "=", 2)
		token := strings.TrimSpace(pair[0])
		if token == "" {
			continue
		}
		name := token
		if len(pair) == 2 && strings.TrimSpace(pair[1]) != "" {
			name = strings.TrimSpace(pair[1])
		}
		items = append(items, BotSignatureConfig{Token: token, Name: name})
	}
	return items
}

// buildConnectionString creates a connection string from individual components
func (c *Config) buildConnectionString() string {
	switch c.Database.Driver {
	case "mysql":
		sslMode := c.Database.SSLMode
		if sslMode == "" {
			sslMode = "disable"
		}
		return c.Database.User + ":" + c.Database.Password + "@tcp(" +
			c.Database.Host + ":" + c.Database.Port + ")/" +
			c.Database.Name + "?parseTime=true&tls=" + sslMode
	case "postgres":
		sslMode := c.Database.SSLMode
		if sslMode == "" {
			sslMode = "disable"
		}
		return "postgres://" + c.Database.User + ":" + c.Database.Password +
			"@" + c.Database.Host + ":" + c.Database.Port + "/" +
			c.Database.Name + "?sslmode=" + sslMode
	case "sqlite3":
		// For SQLite, use the Name as the file path
		if c.Database.Name != "" {
			return c.Database.Name
		}
		return "portfolio.db"
	default:
		return c.Database.Source
	}
}
