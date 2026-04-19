<h1 align="center">🌌 Galaxia OS</h1>

<p align="center">
  <strong>The AI-native OS for solo builders and their projects.</strong>
</p>

<p align="center">
  An open-source framework for a personal AI that is <em>autonomous</em>,
  <em>permanent</em>, <em>pilotable from your phone</em>, and <em>fully
  yours</em>. You install it on a server you own. It works while you sleep.
  It only interrupts you when it matters.
</p>

---

## What Galaxia is

Galaxia is a single entry point to a building of AI-managed projects. Each project is a "room" with its own dedicated General Manager IA that:

- tracks your high-level objectives
- decides what to work on next, every 30 minutes
- dispatches specialized agents (dev, review, analyse, veille, …)
- produces typed action plans that go through a permission-checked runner
- reports back on Telegram

You remain the owner, the router, and the final approver for anything irreversible.

---

## The four pillars (non-negotiable)

1. **Real autonomy.** Galaxia acts. It asks for confirmation only on irreversible actions (sending, paying, publishing, deleting). Everything else just runs.
2. **24/7 continuity.** Galaxia is a daemon, not a chat bot. It keeps working while you sleep.
3. **Phone-first control.** Telegram is a first-class interface. Everything you can do from the terminal you can do from your phone.
4. **Total sovereignty.** Self-hosted, open source, MIT. You bring your LLM keys. Data stays local by default. Routing rules (local vs. cloud, per data class / task type) are yours to write and audit.

See [docs/MANIFESTO.md](docs/MANIFESTO.md) for the full text.

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/Jeffchoux/galaxia /opt/galaxia
cd /opt/galaxia

# 2. Install deps
pnpm install

# 3. Put your keys in .env (chmod 640 root:deskflow)
cat > /opt/galaxia/.env <<EOF
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
GALAXIA_TG_BOT_TOKEN=...   # if using a dedicated bot for the bidirectional control channel
ANTHROPIC_API_KEY=...
GROQ_API_KEY=...
EOF
chmod 640 .env

# 4. Minimal galaxia.yml (see examples/galaxia.yml for a commented example)
mkdir -p /root/galaxia-data/config

# 5. Build and start
pnpm build
GALAXIA_DATA_DIR=/root/galaxia-data node packages/cli/dist/cli.js start
```

Then open `https://<your-host>/dashboard/` (after you configure nginx), log in with your password, and drive the rest from Telegram.

---

## What lives where

- **`/opt/galaxia/`** — source code (this monorepo). 7 packages: `core`, `agents`, `cli`, `dashboard`, `plugins`, `telegram`, `web`.
- **`/opt/galaxia/projects/<name>/`** — each imported project ("room in the building").
- **`/root/galaxia-data/`** — runtime data, never versioned: `state/`, `logs/`, `memory/projects/<name>/gm-{state,journal}.*`, `config/galaxia.yml`, `reports/`, `backups/`.

---

## Documentation

| Document | What's in it |
|---|---|
| [MANIFESTO](docs/MANIFESTO.md) | The *why*: 4 pillars, routing doctrine, the compass. |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | The *how*: monorepo layout, building/rooms/agents/GMs diagram. |
| [ROUTING](docs/ROUTING.md) | dataClass × taskType × rules, `strictLocalOnly`, audit trail. |
| [GENERAL_MANAGER](docs/GENERAL_MANAGER.md) | How each project's GM brain decides and learns. |
| [MULTI_USER](docs/MULTI_USER.md) | Users, scopes, Telegram + web password auth. |
| [TELEGRAM](docs/TELEGRAM.md) | All commands, inline keyboards, allowlist model. |
| [ACTION_RUNNER](docs/ACTION_RUNNER.md) | 8-action v1 surface, allowlists, dry-run/apply. |
| [DASHBOARD](docs/DASHBOARD.md) | Pages, API, auth, scope filtering. |
| [MIGRATION](docs/MIGRATION.md) | How to bring an external project into Galaxia. |
| [SECURITY](docs/SECURITY.md) | Threat model, isolation boundaries, audit. |
| [CONTRIBUTING](docs/CONTRIBUTING.md) | PRs, commit conventions, the compass. |
| [CHANGELOG](docs/CHANGELOG.md) | Phase-by-phase history. |

---

## Status and roadmap

| Pillar | State | Phase |
|---|---|---|
| 1. Real autonomy | Tenu dans le code | Phase 9 — Action runner + `/plan` |
| 2. 24/7 continuity | Tenu dans le code | Phase 5 — Daemon |
| 3. Telegram control | Tenu dans le code | Phase 6 — Bidirectional bot |
| 4. Total sovereignty | Tenu dans le code | Phase 4 — Routing doctrine |

**Completed phases** 0 → 12. See [CHANGELOG](docs/CHANGELOG.md).

**Next** : Phase 14 (conditional) — create a new project by sentence. Phase 15 — public release, manual owner go.

---

## License

MIT. See [LICENSE](LICENSE).

---

## Credits

Created and maintained by Jeff Choux. The manifesto and code evolve under a reference instance (the author's own VPS) that every release must pass through before being tagged — see [MANIFESTO § 5](docs/MANIFESTO.md#5-le-modèle-du-projet).
