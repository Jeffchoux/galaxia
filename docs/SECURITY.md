# Security

Threat model for a self-hosted Galaxia instance, plus the structural defenses we rely on.

## Threats in scope

| # | Threat | Mitigation |
|---|---|---|
| 1 | A compromised LLM output tricks the agent into running a destructive command | Action runner v1 — fixed 8-kind surface, per-project allowlists, no shell metacharacters, no `git push`, path-containment guard. |
| 2 | A compromised session cookie is reused by an attacker | 32-byte random token, `HttpOnly`, `SameSite=Lax`, 24h TTL, in-memory store (daemon restart kills all sessions). |
| 3 | Confidential data leaks to a remote LLM | Routing rules with `strictLocalOnly` + `forbidFallback: true` at the type level — local tier is structurally forced. |
| 4 | Telegram whitelist bypass (stranger messages the bot) | `findUserByTelegramChatId` returns null → **silent drop** (no reply, no callback answer). Never reveal whitelist membership. |
| 5 | Out-of-scope project leak to a collaborator | Scope enforced in every handler + every API endpoint. Out-of-scope projects respond `introuvable`, never `access denied`. |
| 6 | Password brute-force | scrypt (N=16384), 16-byte salt, `timingSafeEqual` compare. No rate limiting yet (see "Open issues"). |
| 7 | A malicious plugin / agent writes outside its project | `edit-file` / `read-file` require `pathIsUnder(project.path)`. `run-shell.cwd` same rule. |
| 8 | `/opt/galaxia/.env` leak | File is `chmod 640 root:deskflow`. Never committed (`.gitignore`). Secrets are referenced via `${VAR}` in `galaxia.yml`, never copied by value. |

## Threats explicitly out of scope (v1)

- A compromised owner account. If the owner's Telegram account or web password is stolen, game over — there's no second factor.
- A malicious daemon binary. If `/opt/galaxia/packages/cli/dist/cli.js` is replaced by an attacker with write access to `/opt/galaxia/`, all bets are off. Rely on filesystem perms.
- Network-level attacks below nginx (tls interception, DDoS). nginx + Let's Encrypt take care of TLS; the rest is out of scope.

## Isolation boundaries

```
HOST (Ubuntu)
 ├─ user root
 │    └─ /root/galaxia-data/         ← runtime data, readable by deskflow for its own uses
 │    └─ /etc/nginx/*, /etc/letsencrypt/*
 ├─ user deskflow (UID 1000)
 │    └─ /opt/galaxia/               ← source + all packages
 │    └─ daemon process              ← everything Galaxia runs lives here
 │    └─ Telegram poller, GM loops, dashboard HTTP
 └─ user worldseed (UID 1003)        ← external AGI, systemd user@
      └─ /home/worldseed/            ← Galaxia does not touch this directory
```

The Worldseed bridge (`/tmp/worldseed-*.jsonl`) is the only cross-user channel, and it's append-only on both sides.

## Audit trail

Every LLM decision lands in `/root/galaxia-data/logs/routing-audit.jsonl` with the context, the matched rule, the provider, the transport, the outcome, and the SHA-256 of the prompt (not the prompt itself). Rotation at `routing.auditLogMaxMB` MB (default 10).

GM decisions land in `/root/galaxia-data/memory/projects/<name>/gm-journal.jsonl` — one line per decision, with the `outcome` field when it dispatched an agent.

Action runner results are returned to the caller; Phase 13+ can route them to a persistent log if needed (not done yet — defer until a concrete need arises).

## Open issues / follow-ups

- **No rate limit** on `/api/login`. An attacker can try indefinitely. Add a simple sliding window in memory + 429 when a threshold is crossed. (Tracked.)
- **Session store is in-memory.** On restart all users have to log in again. Fine for MVP; move to a signed JWT or a file-backed store when the restart frequency becomes a pain point.
- **No CSRF tokens on POST endpoints.** With `SameSite=Lax` and a same-origin form, this is acceptable for a single-owner UI, but worth adding when collaborators start using the dashboard actively.

## Reporting a vulnerability

- **Do not open a public GitHub issue.**
- Email the owner (`jeffchoux@hotmail.com`) with the word `[SECURITY]` in the subject. Expect a first response within 72h and a coordinated disclosure.
