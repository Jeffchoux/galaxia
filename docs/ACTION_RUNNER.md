# Action Runner

Pillar 1 is structural: the set of things an agent can do is finite, typed, and allowlisted per project. Unsafe actions are impossible by construction — not by prompt-engineering hope.

## Surface v1 (8 kinds)

```ts
type Action =
  | EditFileAction         // { kind:'edit-file', path, contents, mode? }
  | ReadFileAction         // { kind:'read-file', path, maxBytes? }
  | RunShellAction         // { kind:'run-shell', command, cwd?, timeoutMs? }
  | Pm2RestartAction       // { kind:'pm2-restart', process }
  | Pm2StatusAction        // { kind:'pm2-status', process? }
  | RunTestsAction         // { kind:'run-tests', filter? }
  | GitCommitAction        // { kind:'git-commit', message, paths? }
  | HttpGetAction;         // { kind:'http-get', url, headers?, maxBytes? }

type ActionPlan = Action[];
```

Everything not in this union is impossible. Notably:

- `git-push` doesn't exist — no field for a remote, no shell-out to `git push`, and a regex-level rejection on any commit message containing "git push".
- `deploy`, `rm`, `sudo anything` — not part of the union.

Extending the surface is a deliberate act: add a kind to the union in `packages/core/src/action-runner/types.ts`, write a handler in `handlers/<kind>.ts`, add a permission check, add a render line — 4 files, auditable.

## Permissions (per project)

```yaml
projects:
  - name: worldseed
    path: /opt/galaxia/projects/worldseed
    allowedShellCommands:
      - pnpm install
      - pnpm build
      - pnpm lint
      - pnpm test
      - git status
    allowedHttpDomains:
      - api.github.com
      - registry.npmjs.org
    pm2Allowed:
      - worldseed-dashboard
```

Matching rules:

- **shell**: `shellIsAllowed(cmd, allowlist)` = normalized exact or prefix-with-space match. **Refuses any shell metacharacter** (`; | && || backticks $( > <`). For "pnpm -w build" in the allowlist, `"pnpm -w build"` and `"pnpm -w build --filter @x"` both match; `"pnpm -w build; rm -rf /"` doesn't.
- **http**: exact hostname match (no wildcards — explicit list is easier to audit).
- **paths**: `edit-file` / `read-file` must be absolute and strictly inside `project.path`. `pathIsUnder` guards against the classic `/foo` matches `/foobar` trap.
- **pm2**: the process name must be in `pm2Allowed` when declared (empty list = blanket refusal).

## Modes

```ts
execute(plan, project, config, { mode: 'dry-run' })
execute(plan, project, config, { mode: 'apply' })
```

`dry-run` validates permissions and returns a `would …` summary without touching anything (except `http-get` and `read-file` — which could be read-only, but for symmetry both also dry-run in v1).

Default per project: `dry-run`. The apply path is gated through Telegram's confirmation flow.

## The `/plan` flow

1. User sends `/plan dev "rewrite login flow"`.
2. The chosen agent (scope-filtered) runs, produces a `summary` + optional `plan: ActionPlan`.
3. If no plan → show the summary, stop.
4. If plan → `validatePlan()` + `execute(dry-run)`.
5. Render per line with ✓ / ✗ icons + rationale.
6. If every action is green → send a carrier message with `[✅ Confirmer] [❌ Annuler]`.
7. On Confirmer → re-run in `apply` mode, report line by line.

Gated confirmation TTL: 60 s (same as other Phase 6 gated actions). The confirmation store keys the apply intent to a random token; an expired token = "Action expirée ou déjà traitée."

## What agents return

`BaseAgent.run()` returns `AgentResult`:

```ts
{
  success: boolean;
  summary: string;
  actions: string[];                 // legacy human-readable list
  knowledgeLearned: KnowledgeEntry[];
  errors: string[];
  plan?: ActionPlan;                 // Phase 9 — optional typed plan
  rawText?: string;                  // LLM raw output, useful for debugging
}
```

The prompt asks the LLM to include a `## Plan` JSON block when it wants concrete actions. `extractPlan()` parses it safely (fenced blocks, garbage → `undefined`). Agents that don't produce a plan work exactly as before.
