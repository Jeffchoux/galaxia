<p align="center">
  <img src="https://raw.githubusercontent.com/Jeffchoux/galaxia/main/.github/banner.svg" alt="GALAXIA" width="600"/>
</p>

<h1 align="center">GALAXIA</h1>
<h3 align="center">Your AI Company in a Box</h3>

<p align="center">
  <strong>Install it. Tell it your idea. AI agents build, run, and grow your business autonomously.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#agents">Agents</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#self-hosted">Self-Hosted</a> &bull;
  <a href="#plugins">Plugins</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI_Cost-$0%2Fmonth-brightgreen" alt="$0/month AI cost"/>
  <img src="https://img.shields.io/badge/LLM-Groq_Free-blue" alt="Groq Free"/>
  <img src="https://img.shields.io/badge/Agents-10_Built--in-purple" alt="10 agents"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"/>
</p>

---

## What is GALAXIA?

GALAXIA is an **Autonomous Business OS** — a self-hosted AI operating system that turns a $10/month VPS into a self-healing, self-improving autonomous infrastructure.

Unlike AI chatbots that wait for your prompts, GALAXIA's agents **work 24/7**: they monitor your apps, fix bugs, optimize performance, audit security, generate ideas, and report back — without you writing a single line of code.

```
You: "Build me a SaaS chatbot for restaurants"
GALAXIA: *scaffolds the app, deploys it, assigns 10 AI agents, starts monitoring*
You: *goes to sleep*
GALAXIA: *fixes 3 bugs, optimizes 2 queries, suggests 5 features, sends you a Telegram report*
```

### Why GALAXIA?

| Other tools | GALAXIA |
|---|---|
| CrewAI / AutoGen — libraries you code WITH | A product you INSTALL. Zero code. |
| Coolify / CapRover — deploy your apps | Agents that fix and improve your code |
| n8n / Zapier — manual workflow design | Autonomous agents that decide what to do |
| ChatGPT / Claude — passive chat | Active agents working 24/7 |
| All of them — $20-100/mo in AI costs | **$0/month** — runs on free LLMs |

---

## Quick Start

```bash
# Install GALAXIA
curl -fsSL https://galaxia.sh/install | bash

# Initialize your project
galaxia init

# Start the autonomous agents
galaxia start
```

Or with Docker:

```bash
git clone https://github.com/Jeffchoux/galaxia.git
cd galaxia
cp galaxia.example.yml galaxia.yml
# Edit galaxia.yml with your config
docker compose up -d
```

**That's it.** GALAXIA discovers your running services, assigns agents, and starts its first cycle within minutes.

---

## Features

### Business in 5 Minutes
Describe your idea, GALAXIA builds it. The `galaxia init` wizard scaffolds your project, deploys it, and assigns AI agents — no code required.

### Zero-Cost AI
GALAXIA uses **Groq** (free, unlimited) for 90% of tasks and **Ollama** (local) for private data. Claude is optional, only for heavy code generation. Your monthly AI bill: **$0**.

### AI Memory (KNOWLEDGE.md)
Every cycle, agents learn and persist discoveries. After a week, GALAXIA knows your project better than you do. After a month, it has 100+ project-specific rules that prevent regressions and compound institutional knowledge.

```markdown
# KNOWLEDGE — my-saas-app

## Bugs Fixed
- SQLite BUSY error under concurrent writes — fixed with WAL mode + retry
- Rate limiter bypass via X-Forwarded-For — fixed with trust proxy config

## Performance Rules  
- Never use SELECT * on the messages table (10M+ rows) — always limit columns
- Image uploads must be < 5MB, validated server-side (client check is bypassable)

## Architecture Decisions
- Stripe webhooks must be idempotent — always check event.id before processing
```

### Mission Mode
Agents don't run wasteful infinite loops. You define **missions** with clear success criteria, agents execute and stop. This saves 95% of token costs compared to continuous-loop frameworks.

```bash
galaxia mission add "Fix all N+1 queries in the API"
# Agents: analyse finds them → dev fixes them → test verifies → cicd deploys → done
```

### 3D Command Center
A stunning Three.js dashboard where your projects are planets and agents are orbiting satellites. Real-time metrics, animated agent activity, and sparkline charts — all in your browser.

---

## Agents

GALAXIA ships with **10 specialized AI agents**, each with a clear role:

| Agent | Role | LLM Tier | What it does |
|---|---|---|---|
| **dev** | Developer | Heavy (Claude) | Reads code, implements fixes, writes features |
| **cicd** | DevOps | Heavy (Claude) | Deploys, tests, rolls back on failure |
| **test** | QA | Light (Groq) | Health checks, e2e tests, regression detection |
| **analyse** | Performance | Light (Groq) | Profiles CPU/RAM, finds bottlenecks, N+1 queries |
| **controle** | Security | Light (Groq) | SSL audit, firewall check, dependency vulnerabilities |
| **veille** | Tech Watch | Light (Groq) | Scans AI news, suggests relevant upgrades |
| **ideas** | Product | Light (Groq) | Brainstorms features, scores impact vs effort |
| **contenu** | Content | Light (Groq) | UX copy audit, SEO suggestions, marketing content |
| **review** | Code Review | Medium (Groq) | 3-tier quality gate: P1 security, P2 bugs, P3 style |
| **maintenance** | SysAdmin | Light (Groq) | Updates deps, prunes Docker, rotates logs |

### How Agents Work

```
                    Mission: "Fix login bug"
                           |
                    +------v------+
                    | Orchestrator |
                    +------+------+
                           |
              Phase 1: Triage (Groq — FREE)
              "Is action needed? What severity?"
                           |
                     Yes, high severity
                           |
              Phase 2: Execute (Claude — only when needed)
                    +------+------+
                    |      |      |
                   dev   test   cicd
                    |      |      |
                  fix → verify → deploy
                           |
              Phase 3: Learn
              → Update KNOWLEDGE.md
              → Update state.json
              → Send Telegram report
```

**The key insight:** Groq (free) handles triage and analysis. Claude is only invoked when code needs to be written. This keeps AI costs at $0 for 90% of cycles.

---

## Configuration

```yaml
# galaxia.yml
business:
  name: "My Startup"
  description: "AI-powered restaurant booking platform"

llm:
  default: groq
  providers:
    groq:
      model: llama-3.3-70b-versatile
    ollama:
      url: http://localhost:11434
      model: llama3.2
    claude:
      model: claude-sonnet-4-6

projects:
  - name: my-api
    path: /opt/my-api
    port: 3000

agents:
  mode: mission
  cycle_interval: 3600

notifications:
  telegram:
    enabled: true
    bot_token: ${TELEGRAM_BOT_TOKEN}
    chat_id: ${TELEGRAM_CHAT_ID}
```

---

## CLI

```bash
galaxia init                          # Interactive project setup
galaxia status                        # System overview + project health
galaxia start                         # Start autonomous agent loop
galaxia stop                          # Stop the agent loop
galaxia run                           # Run one cycle manually
galaxia mission add "Fix all bugs"    # Create a mission
galaxia mission list                  # List active missions
galaxia agent dev "optimize search"   # Run a specific agent
galaxia knowledge my-app              # View learned knowledge
galaxia logs                          # Tail orchestrator logs
```

---

## Self-Hosted

GALAXIA runs on any Linux VPS with Node.js 20+. Recommended: a $5-10/month VPS (2 vCPU, 4GB RAM).

### With Docker (recommended)

```bash
git clone https://github.com/Jeffchoux/galaxia.git
cd galaxia
cp galaxia.example.yml galaxia.yml
docker compose up -d

# Optional: add local LLM
docker compose --profile local-llm up -d
```

### Without Docker

```bash
curl -fsSL https://galaxia.sh/install | bash
galaxia init
galaxia start
```

### Requirements

- **Node.js 20+** (or Docker)
- **A Groq API key** — free at [console.groq.com](https://console.groq.com)
- **Optional:** Ollama for local/private AI
- **Optional:** Anthropic API key for Claude (heavy code generation)
- **Optional:** Telegram bot for notifications

---

## Plugins

Extend GALAXIA with custom agents, LLM providers, and dashboard widgets.

```typescript
import type { GalaxiaPlugin } from '@galaxia/plugins';

const myPlugin: GalaxiaPlugin = {
  name: 'my-custom-agent',
  version: '1.0.0',
  agents: [{
    name: 'seo',
    description: 'Advanced SEO optimization agent',
    tier: 'light',
    systemPrompt: 'You are an SEO expert...',
  }],
};

export default myPlugin;
```

```bash
galaxia plugin install ./my-plugin
```

---

## The Story Behind GALAXIA

GALAXIA was born from a real production system running 4 SaaS products on a single $20/month VPS. The agents ran 227 cycles doing nothing useful before we invented **Mission Mode** — targeted interventions with clear success criteria instead of wasteful infinite loops.

Today, GALAXIA autonomously manages code, security, performance, and content for multiple businesses — at zero AI cost thanks to Groq's free tier.

Read the full story: [From 227 Wasted Cycles to Mission Mode](https://github.com/Jeffchoux/galaxia/wiki/mission-mode-story)

---

## Architecture

```
galaxia/
  packages/
    core/        # Engine: orchestrator, LLM router, state, knowledge
    agents/      # 10 built-in AI agents
    cli/         # CLI tool (galaxia command)
    dashboard/   # 3D Command Center (Three.js)
    plugins/     # Plugin system
  templates/     # Business project templates
  docker-compose.yml
  galaxia.yml    # Your configuration
```

**Monorepo** powered by Turborepo + pnpm. Each package is independently buildable and publishable.

---

## Contributing

GALAXIA is MIT licensed and welcomes contributions.

```bash
git clone https://github.com/Jeffchoux/galaxia.git
cd galaxia
pnpm install
pnpm build
```

### Good First Issues

- Add a new agent role (e.g., `monitoring`, `docs`)
- Add a new LLM provider (e.g., Mistral, Together AI)
- Add a new business template
- Improve the 3D dashboard
- Write tests

---

## License

MIT - See [LICENSE](LICENSE)

---

<p align="center">
  Built with autonomy by <a href="https://github.com/Jeffchoux">Jeff Choux</a><br/>
  <sub>GALAXIA — Because your business should run itself.</sub>
</p>
