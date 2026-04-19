# Architecture

A Galaxia instance is one daemon process that owns four long-running loops + a webserver:

```
                   ┌─────────────────────────── daemon (PID file) ────────────────────────────┐
                   │                                                                           │
  Telegram  ─────► │  poller loop   ─► router  ─► handlers  ─► Action Runner ─► filesystem / │
  Dashboard ─────► │                                                             pm2 / LLM     │
  User shell ────► │  cycle loop    ─► orchestrator ─► agents (TS)               ▲             │
                   │                                                             │             │
                   │  GM loops (1/project with gm.enabled)                       │             │
                   │      decideNext  ─► agent dispatch / wait / drop-objective  │             │
                   │                                                             │             │
                   │  dashboard HTTP (port 3333) ─── auth (cookie + scrypt)      │             │
                   └─────────────────────────────────────────────────────────────┘             │
                                         │                                                     │
                                         ▼                                                     │
                          /root/galaxia-data/     (state, audit, GM journals, missions, ...)   │
                                         ▲                                                     │
                                         │                                                     │
                          /opt/galaxia/projects/<name>/    (the rooms — one per imported pj) ──┘
```

## Packages (monorepo, pnpm + turbo)

| Package | What it is | Depends on |
|---|---|---|
| `@galaxia/core` | Types, config, LLM router, state/knowledge, orchestrator, action runner, GM, worldseed adapter, auth, routing engine, github discover. | none |
| `@galaxia/agents` | 10 role agents (dev, cicd, test, analyse, controle, veille, ideas, contenu, review, maintenance) + base class. | core |
| `@galaxia/telegram` | Bidirectional bot: poller, router, handlers, confirmation store, discovery store. | core, agents |
| `@galaxia/cli` | `galaxia start/stop/status/logs/audit/…` + daemon spawn. | core, agents, telegram (dynamic) |
| `@galaxia/dashboard` | HTTP observability dashboard, session auth, scope-aware APIs. | core |
| `@galaxia/plugins` | Plugin registry skeleton. | core |
| `@galaxia/web` | Static landing page for the instance's domain. | — |

The daemon lives in `@galaxia/cli` — it boots, reads config, kicks off the orchestrator cycle, the Telegram poller, the GM loops, and (if enabled) the dashboard HTTP server.

## Data layout

Two strict zones, never mixed:

```
/opt/galaxia/                  ← source code (git), owned by deskflow
  packages/                    ← monorepo packages
  projects/                    ← imported projects, one folder each
    learn-ai/ …                  (the "rooms")
  docs/                        ← this directory
  .env                         ← secrets, chmod 640 root:deskflow

/root/galaxia-data/            ← runtime data (never versioned)
  config/
    galaxia.yml                ← the only user-facing config
  state/state.json             ← orchestrator output per cycle
  logs/
    orchestrator.log           ← rotating
    routing-audit.jsonl        ← every callLLM() decision
  memory/
    projects/<name>/
      gm-state.json            ← GMState for this project
      gm-journal.jsonl         ← append-only
      KNOWLEDGE.md             ← per-project knowledge
    imported-legacy/           ← Phase 0 archive
  missions.json
  reports/                     ← one per phase
  backups/
```

## The four loops

1. **Cycle loop** — every `agents.cycleInterval` seconds, the orchestrator collects system metrics, triages each project (LLM → JSON), and dispatches agents via `@galaxia/agents.getAgent()` (TS, no more bash).
2. **Telegram poller** — long-polling `getUpdates` with backoff; routes messages through `auth → router → handler`. Authenticated users = `config.users[]` by `telegram.telegramChatIds`.
3. **GM loops** — one per project with `gm.enabled`. Every `gm.intervalMinutes` (default 30), asks its brain what to do, acts, journals.
4. **Dashboard HTTP** — port 3333, in-process, behind the nginx `/dashboard/` location.

## Cross-package runtime imports

`@galaxia/core.orchestrator` and `@galaxia/core.gm.manager` need to call `@galaxia/agents.getAgent()` at runtime. Declaring the dependency in `@galaxia/core/package.json` would introduce a cycle (`agents` → `core` already). The workaround is a dynamic `import(new URL('../../agents/dist/index.js', import.meta.url))` — tied to the monorepo layout but stable.

Same pattern for `@galaxia/dashboard` when spawned from the daemon (`@galaxia/cli`).
