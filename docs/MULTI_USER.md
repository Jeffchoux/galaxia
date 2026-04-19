# Multi-user

Galaxia supports multiple humans with a **strict per-project scope**. The owner sees everything, collaborators see only the projects they're scoped to. Scope leakage is treated as a bug (never reveal the existence of an out-of-scope project).

## Shape

```yaml
owner: jeff
users:
  - name: jeff
    role: owner
    scope: ['*']
    auth:
      telegramChatIds: [${TELEGRAM_CHAT_ID}]
      webPasswordHash: "scrypt$<salt-hex>$<hash-hex>"

  - name: milan
    role: collaborator
    scope: ['learn-ai']
    auth:
      telegramChatIds: [1234567890]        # may be empty until she joins
      webPasswordHash: "scrypt$..."
```

## Roles

| Role | Scope | Can do |
|---|---|---|
| `owner` | `'*'` | Everything. `/discover`, `/new`, `/users`, create objectives on any project. |
| `collaborator` | explicit list | See and act only on projects in the list. Can add objectives, see audit for own projects. |

## Auth channels

### Telegram
Every incoming message's `chat_id` is looked up against `users[].auth.telegramChatIds`. No match = silent drop (no "access denied" reply, so a probing stranger gets the same behaviour as void).

Legacy fallback: if `users[]` is missing/empty, `telegram.allowedChatIds` is used and the caller is synthesised as an owner with scope `'*'`. This keeps single-owner installs working without touching the YAML.

### Web password
`POST /dashboard/api/login` with `{userName, password}`:

1. `authenticateByPassword(userName, password, config)`:
2. Finds the user in `users[]` by name.
3. Reads `auth.webPasswordHash` (format `scrypt$<salt-hex>$<hash-hex>`).
4. `timingSafeEqual` on the scrypt derivation of the provided password.
5. On success, a 32-byte hex session token is minted, stored in-memory (24h TTL), and set as `gx_session` cookie (`HttpOnly`, `SameSite=Lax`).

Passwords are hashed with Node's built-in `scrypt` — zero new npm dependency. `hashPassword(pw)` is exported from `@galaxia/core` for tooling:

```bash
node -e "import('/opt/galaxia/packages/core/dist/index.js').then(({hashPassword})=>console.log(hashPassword('MyPw')))"
```

## Scope primitives

```ts
import { userCanAccess, requireScope, requireOwner, isOwner } from '@galaxia/core';

if (!userCanAccess(user, 'learn-ai')) { /* treat like not-found */ }
requireScope(user, 'learn-ai');   // throws ScopeError
requireOwner(user);               // throws OwnerOnlyError
```

## How it shows in the UI

| Surface | Scope behaviour |
|---|---|
| `/projects` (Telegram) | Filtered: `collaborator` only sees their projects. |
| `/project <name>` (Telegram) | Out of scope → "Projet introuvable" (same as non-existent — don't leak). |
| `/agent <type> "<task>"` | Uses the first project the user can see. |
| `/plan` | Same — runs the agent in-scope. |
| `/objective <project>` | Permission checked before adding. |
| `/gm <project> [pause|resume]` | Same. |
| `/discover` | **Owner only** (non-owner gets "Commande inconnue"). |
| `/worldseed` | **Owner only**. |
| Dashboard `/api/users` | **Owner only** (`403` for others). |
| Dashboard `/api/projects` | Filtered by scope. |
| Dashboard `/api/audit` | Entries with `projectTag` out of scope are dropped. |

## Activating a new collaborator (Milan example)

1. Generate her password hash:
   ```bash
   node -e "import('/opt/galaxia/packages/core/dist/index.js').then(({hashPassword})=>console.log(hashPassword('milansPwd')))"
   ```
2. Ask her to message the bot once so you can read her `chat_id` (in `/root/galaxia-data/logs/orchestrator.log` or `tail -f` on the bot logs).
3. Edit `galaxia.yml`:
   ```yaml
   - name: milan
     role: collaborator
     scope: ['learn-ai']
     auth:
       telegramChatIds: [<the chat_id>]
       webPasswordHash: <the scrypt hash>
   ```
4. Restart the daemon so the config reloads:
   ```bash
   GALAXIA_DATA_DIR=/root/galaxia-data node packages/cli/dist/cli.js stop
   GALAXIA_DATA_DIR=/root/galaxia-data node packages/cli/dist/cli.js start
   ```

She can now both `/whoami` on Telegram and log into `https://<host>/dashboard/`.
