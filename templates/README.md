# GALAXIA Templates

Business starter templates used by `galaxia init` to scaffold new projects.

## Available Templates

| Template | Directory | Description |
|----------|-----------|-------------|
| **api** | `templates/api/` | REST API with auth, CRUD, rate limiting |
| **blog** | `templates/blog/` | Blog with markdown posts, admin panel, RSS |
| **landing** | `templates/landing/` | Landing page with email capture and analytics |

## Template Structure

Each template contains:

- `template.json` — metadata, keywords (used for matching business descriptions), port config
- `server.js` — Express ES module server with SQLite (better-sqlite3, WAL mode)
- `package.json` — dependencies (type: "module", no build step)
- `.env.example` — environment variables with defaults

## Placeholders

Templates use these placeholders, replaced by `galaxia init`:

- `{{PROJECT_NAME}}` — the project name (slugified)
- `{{PROJECT_DESCRIPTION}}` — user's business description

## Conventions

All templates follow these rules so GALAXIA agents can autonomously manage them:

- ES modules (`"type": "module"`)
- Express + better-sqlite3 (consistent stack)
- `/health` endpoint on every server (for monitoring)
- SQLite with WAL mode (concurrent reads)
- Graceful shutdown handlers (SIGTERM/SIGINT)
- Server binds to `127.0.0.1` (Nginx handles external traffic)
- No build step — `node server.js` to run
- Inline CSS/HTML (no separate static files needed)

## Creating a Custom Template

1. Create a new directory under `templates/`
2. Add a `template.json` with name, description, and keywords
3. Add `server.js`, `package.json`, and `.env.example`
4. Ensure `/health` endpoint exists
5. Use `{{PROJECT_NAME}}` and `{{PROJECT_DESCRIPTION}}` placeholders

The `keywords` array in `template.json` is matched against the user's business idea description to select the best template.
