package config

import (
	"os"

	"github.com/zeromicro/go-zero/rest"
)

type Config struct {
	rest.RestConf
	Database DatabaseConfig `json:"database"`
	Auth     AuthConfig     `json:"auth"`
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

	// Auto-generate connection string if individual components are provided
	if c.Database.Source == "" && c.Database.Host != "" {
		c.Database.Source = c.buildConnectionString()
	}
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
