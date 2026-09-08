package main

import (
	"flag"
	"fmt"
	"os"

	"silan-backend/internal/config"
	"silan-backend/internal/handler"
	"silan-backend/internal/middleware"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
	"github.com/zeromicro/go-zero/rest/router"
)

var (
	configFile     = flag.String("f", "etc/backend-api.yaml", "the config file")
	dbDriver       = flag.String("db-driver", "", "database driver (mysql, postgres, sqlite3)")
	dbSource       = flag.String("db-source", "", "database connection string")
	dbHost         = flag.String("db-host", "", "database host")
	dbPort         = flag.String("db-port", "", "database port")
	dbUser         = flag.String("db-user", "", "database user")
	dbPassword     = flag.String("db-password", "", "database password")
	dbName         = flag.String("db-name", "", "database name")
	serverHost     = flag.String("host", "", "server host")
	serverPort     = flag.Int("port", 0, "server port")
	googleClientID = flag.String("google-client-id", "", "Google OAuth client ID (optional)")
)

func main() {
	flag.Parse()

	var c config.Config

	// Load config from file if it exists
	if _, err := os.Stat(*configFile); err == nil {
		conf.MustLoad(*configFile, &c)
	} else {
		// Use default config if file doesn't exist
		c.Name = "silan-backend"
		c.Host = "0.0.0.0"
		c.Port = 5200
	}

	// Override with command line flags if provided
	if *dbDriver != "" {
		c.Database.Driver = *dbDriver
	}
	if *dbSource != "" {
		c.Database.Source = *dbSource
	}
	if *dbHost != "" {
		c.Database.Host = *dbHost
	}
	if *dbPort != "" {
		c.Database.Port = *dbPort
	}
	if *dbUser != "" {
		c.Database.User = *dbUser
	}
	if *dbPassword != "" {
		c.Database.Password = *dbPassword
	}
	if *dbName != "" {
		c.Database.Name = *dbName
	}
	if *serverHost != "" {
		c.Host = *serverHost
	}
	if *serverPort != 0 {
		c.Port = *serverPort
	}
	// Auth flags
	if *googleClientID != "" {
		c.Auth.GoogleClientID = *googleClientID
	}

	// Load environment variables (overrides file config)
	c.LoadConfigFromEnv()
	c.ApplyRuntimeLimits()

	// Set default database configuration if not provided
	if c.Database.Driver == "" {
		c.Database.Driver = "sqlite3"
		c.Database.Source = "portfolio.db"
	}

	// Validate configuration
	if err := validateConfig(&c); err != nil {
		fmt.Printf("Configuration error: %v\n", err)
		os.Exit(1)
	}

	server := rest.MustNewServer(c.RestConf, rest.WithRouter(middleware.NewCorsRouter(router.NewRouter())))
	defer server.Stop()

	ctx := svc.NewServiceContext(c)
	handler.RegisterHandlers(server, ctx)

	fmt.Printf("Starting Silan Backend Server...\n")
	fmt.Printf("Server: %s:%d\n", c.Host, c.Port)
	fmt.Printf("Database: %s (%s)\n", c.Database.Driver, maskPassword(c.Database.Source))
	server.Start()
}

// validateConfig validates the configuration
func validateConfig(c *config.Config) error {
	if c.Database.Driver == "" {
		return fmt.Errorf("database driver is required")
	}

	supportedDrivers := map[string]bool{
		"mysql":    true,
		"postgres": true,
		"sqlite3":  true,
	}

	if !supportedDrivers[c.Database.Driver] {
		return fmt.Errorf("unsupported database driver: %s (supported: mysql, postgres, sqlite3)", c.Database.Driver)
	}

	if c.Database.Source == "" {
		return fmt.Errorf("database source/connection string is required")
	}
	if token := c.Security.StatsSyncToken; token != "" && len(token) < 32 {
		return fmt.Errorf("STATS_SYNC_TOKEN must contain at least 32 bytes")
	}

	return nil
}

// maskPassword masks password in connection string for logging
func maskPassword(connectionString string) string {
	// Simple password masking for logging
	if len(connectionString) > 20 {
		return connectionString[:10] + "***" + connectionString[len(connectionString)-7:]
	}
	return "***"
}
