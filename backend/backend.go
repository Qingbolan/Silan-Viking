package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"

	"silan-backend/internal/config"
	"silan-backend/internal/handler"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
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

	server := rest.MustNewServer(c.RestConf)
	defer server.Stop()

	ctx := svc.NewServiceContext(c)
	handler.RegisterHandlers(server, ctx)

	// Add global OPTIONS handler for CORS
	server.AddRoute(rest.Route{
		Method: http.MethodOptions,
		Path:   "/*",
		Handler: func(w http.ResponseWriter, r *http.Request) {
			// Set CORS headers manually
			origin := r.Header.Get("Origin")
			allowedOrigins := []string{
				"http://localhost:3000",
				"http://localhost:3001",
				"http://localhost:5173",
				"http://127.0.0.1:3000",
				"http://127.0.0.1:3001",
				"http://127.0.0.1:5173",
				// Production domains
				"https://silan.tech",
				"https://www.silan.tech",
				// NUS domain where the site may be embedded or proxied
				"https://www.comp.nus.edu.sg",
				"https://comp.nus.edu.sg",
			}

			// Check if the origin is allowed
			isAllowed := false
			for _, allowedOrigin := range allowedOrigins {
				if origin == allowedOrigin {
					isAllowed = true
					break
				}
			}

			// Ensure caches know the response may vary by Origin
			w.Header().Add("Vary", "Origin")

			if isAllowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else if origin == "" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")

			w.WriteHeader(http.StatusOK)
		},
	})

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
