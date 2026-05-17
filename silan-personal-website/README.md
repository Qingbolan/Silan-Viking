# Silan Personal Website - Python CLI Tools

Python command-line interface for the Silan Personal Website platform. Provides intelligent content management, database synchronization, and backend server management.

## Features

- **Content Management** - Create and manage projects, blogs, ideas, and episodes
- **Database Sync** - Automated markdown-to-database synchronization (MySQL, PostgreSQL, SQLite)
- **Frontend Templates** - Install static or development frontend templates
- **Backend Management** - Start, stop, and manage Go backend server
- **File Operations** - Edit, append, and write content files
- **Content Discovery** - List, show, and search content across types

## Installation

```bash
pip install silan-personal-website
```

## Quick Start

### Initialize a New Portfolio

```bash
silan init my-portfolio
cd my-portfolio
```

### Create Content

```bash
# Create a new project
silan new project "My Project" --title "Amazing Project"

# Create a blog post
silan new blog "my-post" --title "My First Post"

# Create an idea
silan new idea "Research Idea" --title "AI Innovation"
```

### Sync to Database

```bash
# Configure database (interactive)
silan db-config interactive

# Sync content to database
silan db-sync
```

### Start Backend Server

```bash
# Start the Go backend server
silan backend start --db-type sqlite --db-path portfolio.db
```

### Install Frontend

```bash
# Install static frontend files
silan frontend install

# Install full development project
silan frontend install --dev
```

## Commands

### Content Creation

- `silan new <type> <name>` - Create new content (project, blog, idea, episode)
- `silan projects create` - Create project scaffold
- `silan ideas create` - Create idea scaffold

### Database Operations

- `silan db-sync` - Sync markdown content to database
- `silan db-config` - Manage database configuration

### Backend Management

- `silan backend start` - Start Go backend server
- `silan backend stop` - Stop backend server
- `silan backend status` - Check backend status
- `silan backend logs` - View backend logs
- `silan backend install` - Build backend binary

### Frontend Management

- `silan frontend install` - Install frontend templates
- `silan frontend install --dev` - Install development project

### Content Operations

- `silan ls [type]` - List content items
- `silan show <type> <name>` - Show content details
- `silan search <query>` - Search content
- `silan edit <type> <name> <file>` - Edit content file
- `silan append <type> <name> <file>` - Append to content file

### Utilities

- `silan status` - Show project status
- `silan help [topic]` - Get help
- `silan skill install` - Install the bundled Claude Code skill for AI-assisted content management
- `silan skill status` - Show installed skill state

### AI-Assisted Content Management

The package bundles a [Claude Code](https://claude.com/claude-code) skill (`silan-blog`)
that teaches AI assistants how to create, edit, and sync your website content.
Install it with a single command after `pip install`:

```bash
silan skill install            # installs into ~/.claude/skills
silan skill install --project  # or into ./.claude/skills (shared via the repo)
```

Once installed, ask Claude Code things like "add a new blog post" or "sync my
content to the database" and it will follow the correct `silan` workflow.

## Configuration

The CLI uses a `silan.yaml` configuration file in your project directory:

```yaml
project:
  name: "My Portfolio"
  language: "en"

database:
  type: "sqlite"
  path: "portfolio.db"

auth:
  google_client_id: "your-client-id"

content_types:
  - blog
  - projects
  - ideas
  - resume
  - episode
```

## Database Support

- **SQLite** - Local development (default)
- **MySQL** - Production database
- **PostgreSQL** - Alternative production database

## Requirements

- Python 3.9+
- Go 1.23+ (for backend server)
- Node.js 18+ (for frontend development)

## Development

```bash
# Clone repository
git clone https://github.com/Qingbolan/Silan-Personal-Website.git
cd Silan-Personal-Website/silan-personal-website

# Install in development mode
pip install -e .

# Run tests
pytest

# Format code
black silan/
```

## Documentation

Full documentation available at: [https://github.com/Qingbolan/Silan-Personal-Website](https://github.com/Qingbolan/Silan-Personal-Website)

## License

Apache License 2.0

## Author

**Silan Hu** - AI Researcher & Full Stack Developer

- Website: [silan.tech](https://silan.tech/)
- GitHub: [@Qingbolan](https://github.com/Qingbolan)
- Email: silan.hu@u.nus.edu

## Contributing

Contributions are welcome! Please read the contributing guidelines in the main repository.

## Changelog

### v1.0.0 (2025-10-06)

- Initial release
- Content management CLI
- Database synchronization (MySQL, PostgreSQL, SQLite)
- Backend server management
- Frontend template installation
- Frontmatter removal support
- Multi-language content support
