# Changelog

Pre-release chronological history. Versions will be tagged starting with `v0.1.0` at the first public release (Phase 15 — manual owner go).

All merges go into `main` locally, with `--no-ff` merge commits. No push to the public remote yet.

## Phase 13 — Docs (2026-04-19)
- README rewritten around the 4 pillars + building/rooms metaphor (no more "AI Company in a Box").
- `docs/` populated: `ARCHITECTURE`, `ROUTING`, `GENERAL_MANAGER`, `MULTI_USER`, `TELEGRAM`, `ACTION_RUNNER`, `DASHBOARD`, `MIGRATION`, `SECURITY`, `CONTRIBUTING`, `CHANGELOG`.
- `.github/workflows/ci.yml` CI matrix (lint + build + node version).
- Issue + PR templates.
- `examples/galaxia.yml` commented reference config.

## Phase 12 — Dashboard observabilité (2026-04-19, merge `2586d75`)
Observability web UI at `/dashboard/`. Session cookie auth (scrypt password), scope-filtered API. 5 tabs: Overview, Projects, Audit, Missions, Users (owner only). Vanilla Node HTTP + HTML (no Next.js, justified in report). Legacy 3D view preserved at `/3d.html`.

## Phase 11 — AGI Worldseed adapter (2026-04-19)
File-based JSONL bridge (`/tmp/worldseed-requests.jsonl` + responses). `consultWorldseed()` with graceful fallback to the regular LLM router. `/worldseed <question>` owner-only Telegram command. Live integration partial — Worldseed still needs a ~20-line tail script on its side.

## Phase 10 — General Manager per project (2026-04-19)
One `ProjectGM` per project with `gm.enabled`. Reviews every `intervalMinutes` (default 30), decides dispatch / wait / drop-objective, journals to `gm-journal.jsonl`. `/objective` and `/gm` Telegram commands. Activated on `learn-ai`.

## Phase 9 — Action runner + bash→TS (2026-04-19)
Typed 8-kind action surface with per-project allowlists, dry-run/apply modes. `BaseAgent` parses `## Plan` JSON. `/plan` Telegram preview+apply flow. Orchestrator no longer shells out to legacy `/opt/agents/*/run.sh` — dispatches to `@galaxia/agents` TS roles.

## Phase 8.5 — GitHub Discovery (2026-04-19)
`/discover` Telegram command (owner-only): lists all GitHub repos, offers `Create piece | Archive | Ignore` per repo via inline keyboard. `createRoom()` clones + updates `galaxia.yml`.

## Phase 8 bis — clone eterna-app (2026-04-19)
After `gh auth login`, real clone of `Jeffchoux/eterna-app`. `learn-ai` stays placeholder (repo doesn't exist yet on GitHub).

## Phase 8 — Project migration (2026-04-19)
`/opt/galaxia/projects/{learn-ai, worldseed, eterna-app, boostmybiz}/`. Worldseed code applicatif migrated. 3 placeholders (gh not auth'd at the time). `galaxia.yml` declares 4 projects.

## Phase 7 — Multi-user (2026-04-19, merge `2d3805f`)
`users[]` with scope + Telegram + web password. `userCanAccess`, `authenticateByPassword` (scrypt). `/whoami`. All handlers scope-filtered. Backward-compat with legacy `telegram.allowedChatIds`.

## Consolidation C — working tree (2026-04-19, merge `1695ccd`)
Commit the pre-Phase 0 working-tree changes (ESM, dashboard graceful shutdown, landing refresh, `docs/MANIFESTO.md`). `.gitignore` cleanup.

## Consolidation B — galaxia-os.com SSL (2026-04-19)
DNS → 188.34.188.200. Let's Encrypt cert for `galaxia-os.com` + `www`. Static landing under `packages/web/public`.

## Consolidation A — sudo NOPASSWD (2026-04-19)
`/etc/sudoers.d/deskflow-galaxia` — unblocks sysadmin phases for the deskflow-run daemon.

## Phase 0 — Grand nettoyage (2026-04-19, merge `4cf1f17`)
Decommissioned the pre-Galaxia VPS ecosystem: 10 PM2 services, 18 `/opt/` folders (~4.1 GB freed), 8 nginx vhosts, 8 LE certs, netdata, 6 archived GitHub repos. Backup + knowledge archived. `/opt/galaxia/projects/` created.

## Phase 6 — Telegram bidirectionnel (2026-04-18, merge `b14c288`)
Zero-dep TS Telegram bot: long polling with backoff, router, 10 commands, inline keyboard confirmations. Pillar 3.

## Phase 5 — Daemon alive (2026-04-18, merge `5f0001b`)
`galaxia start/stop/status/logs` with a real daemon, cycle loop, graceful shutdown, SIGTERM grace. Pillar 2.

## Phases 4.2, 4.1, 4 — Claude dual transport, Claude HTTP, routing wiring
Claude CLI-first with HTTP fallback. `BaseAgent` + 10 roles routed via `callLLM(ctx, ...)`.

## Phase 3 — Routing contextuel (commit `dd26923`)
`RoutingContext` (dataClass × taskType × projectTag × timeWindow), rules engine, `strictLocalOnly`, audit JSONL with SHA-256 prompt hash. Pillar 4 foundation.

## Phase 2 — Core/Data separation (commit `275dbd8`)
`paths.ts` single source of truth. Strict Core / Config / Data boundaries.

## Phase 1 — Audit & prep
Initial audit of the Core (29 files, 2719 LOC). Manifesto copied in. `/root/galaxia-data/` created.
