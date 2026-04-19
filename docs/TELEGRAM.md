# Telegram

Galaxia talks to its owner through Telegram. The bot is bidirectional: you send commands, it executes or confirms; it sends reports when things matter.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather), get its token. Recommend a dedicated bot (e.g. `@galaxia_<you>_bot`) to avoid sharing with other integrations — Telegram only allows one `getUpdates` consumer per token.
2. Put the token in `.env` as `GALAXIA_TG_BOT_TOKEN`.
3. Wire it in `galaxia.yml`:
   ```yaml
   telegram:
     enabled: true
     botToken: ${GALAXIA_TG_BOT_TOKEN}
     allowedChatIds: [${TELEGRAM_CHAT_ID}]
     pollingIntervalMs: 30000
     requiresConfirmation:
       - dispatch-cicd
       - dispatch-dev
       - mission-delete
       - action-plan-apply
   ```
4. Send `/start` to the bot. If your `chat_id` is in `allowedChatIds` (or in a `users[].auth.telegramChatIds`), you'll get the help reply. If not, **total silence** — the bot does not reveal its existence to non-whitelisted chats.

## Commands

| Command | Purpose | Scope |
|---|---|---|
| `/status` | Daemon health (uptime, cycles, last routing decision) | any |
| `/whoami` | Your name, role, scope | any |
| `/projects` | List projects you can see | any (filtered) |
| `/project <name>` | Details of a project (status, knowledge, backlog) | in-scope only |
| `/agent <type> "<task>"` | Dispatch an agent immediately | in-scope |
| `/plan <type> "<task>"` | Dry-run an action plan, then confirm → apply | in-scope |
| `/mission add "<desc>"` | Add a mission | any |
| `/missions` | List active missions | any |
| `/audit [N]` | Last N routing decisions | any (filtered) |
| `/logs [N]` | Last N daemon log lines | any |
| `/objective <project> "<text>"` | Add a high-level objective for the project's GM | in-scope |
| `/gm <project>` | Show GM state + last decision | in-scope |
| `/gm <project> pause|resume` | Pause or resume the GM loop | in-scope |
| `/discover` | List GitHub repos, integrate / archive / ignore | **owner only** |
| `/worldseed <question>` | Ask the Worldseed AGI (with fallback to standard LLM) | **owner only** |
| `/help` | Command list | any |
| `<free text>` | Conversation with the LLM (routed with `dataClass=personal`) | any |

## Inline keyboards

Irreversible actions don't execute immediately. They emit a carrier message with two buttons:

```
⚠️ dispatch-dev
Task: rewrite login flow
  [✅ Confirmer] [❌ Annuler]
```

TTL 60 s (server-side). After that the carrier message is edited to "⏱ Expiré" and the intent is dropped. The list of gated actions lives in `telegram.requiresConfirmation`.

`/plan` uses the same flow: the preview message carries `[✅ Confirmer] [❌ Annuler]`. Confirmer re-runs the plan in `apply` mode.

`/discover` uses a separate 3-button keyboard per repo: `[✅ Créer pièce] [❌ Archiver] [⏭️ Ignorer]`. TTL 5 min (more time — a whole repo inventory session).

## Auth model

One source of truth: `findUserByTelegramChatId(chatId, config)` in `@galaxia/core`. Order:

1. `config.users[]` — match `chatId` against each `auth.telegramChatIds`.
2. Fallback: `config.telegram.allowedChatIds` — only used when `users[]` is empty. Synthesises an owner with scope `'*'`.
3. Neither matches → `null` → **silent drop**, no reply, no callback-query answer.

Non-owners who try owner-only commands (e.g. `/discover`) receive the generic `Commande inconnue. /help` — same output a typo would produce, so probing is indistinguishable from a miss.

## Free text conversation

Any non-`/` message is routed through `callLLM({dataClass:'personal', taskType:'analysis'})`. The reply includes a thin header `[provider/transport · rule]` so you can see which engine handled it at a glance.

## Notes

- Reply length capped at ~3800 chars (under Telegram's 4096 limit).
- MarkdownV2 used throughout, with defensive escapement. A fallback to plain text is attempted on parse errors.
- Timezone for human dates in replies = `display.timezone` (default UTC).
