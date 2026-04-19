# Migrating a project into Galaxia

You have an existing project on GitHub (or a local folder). You want it to live in your Galaxia building so its GM can manage it.

## Option A — Interactive from Telegram (owner only)

```
/discover
```

Lists every GitHub repo of the authenticated `gh` user with a 5-button inline keyboard per repo:

- `✅ Créer pièce` → clones into `/opt/galaxia/projects/<name>/`, writes `GALAXIA_PIECE.md`, appends to `galaxia.yml → projects[]`.
- `❌ Archiver` → `gh repo archive <owner>/<name>`.
- `⏭️ Ignorer` → no-op.

Pre-req: `gh auth login` on the VPS (owner terminal).

## Option B — Manual

```bash
# 1. Clone next to the others
cd /opt/galaxia/projects
git clone git@github.com:<owner>/<repo>.git

# 2. Drop the nested .git if you don't want submodule-like behaviour in the main monorepo
rm -rf <repo>/.git

# 3. Register it
cat >> /root/galaxia-data/config/galaxia.yml <<EOF
  - name: <repo>
    path: /opt/galaxia/projects/<repo>
    description: "…"
    allowedShellCommands:
      - pnpm install
      - pnpm build
    allowedHttpDomains:
      - api.github.com
    gm:
      enabled: false           # set true when ready
EOF

# 4. Let the daemon reload the config
GALAXIA_DATA_DIR=/root/galaxia-data node packages/cli/dist/cli.js stop
GALAXIA_DATA_DIR=/root/galaxia-data node packages/cli/dist/cli.js start
```

Check `/projects` on Telegram or `https://<host>/dashboard/` → Projects tab.

## Option C — Placeholder first, populate later

When the repo doesn't exist yet (e.g. a contributor hasn't migrated), create a placeholder:

```bash
mkdir -p /opt/galaxia/projects/<name>
cat > /opt/galaxia/projects/<name>/README.md <<'EOF'
# <name> (placeholder)
Repo pas encore cloné. À remplacer en place quand prêt.
EOF
```

Add it to `galaxia.yml → projects[]` with a clear `description` that marks it as placeholder. Turn its GM off until real code arrives.

## Onboarding checklist

- [ ] Project folder under `/opt/galaxia/projects/<name>/`
- [ ] `description`, `path`, `name` set in `galaxia.yml`
- [ ] `allowedShellCommands` curated (`pnpm install`, `pnpm build`, `pnpm test`, `git status` is a good start)
- [ ] `allowedHttpDomains` listing whatever the project legitimately fetches
- [ ] `gm.enabled` off until you're sure
- [ ] A collaborator added to `users[]` with the project in their `scope`, if any
- [ ] Daemon restarted to pick up the config

## Watching the new project

- `/projects` on Telegram → runtime state per project
- `/gm <name>` → GM status once enabled
- Dashboard Audit tab → filter by project
- `cat /root/galaxia-data/memory/projects/<name>/gm-journal.jsonl` → raw GM journal
