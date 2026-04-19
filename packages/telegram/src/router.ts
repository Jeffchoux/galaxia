// GALAXIA Telegram — command router.
//
// Parses the incoming message's text, dispatches to a handler. Callback
// queries (inline keyboard clicks) are handled by confirmation.ts — this
// module only deals with TelegramMessage updates.

import type { GalaxiaConfig } from '@galaxia/core';
import type {
  CommandContext,
  TelegramMessage,
  TelegramClientLike,
} from './types.js';
import { findUser } from './auth.js';
import { resolveTimezone } from './format.js';
import { ConfirmationStore } from './confirmation.js';
import { handleStatus } from './handlers/status.js';
import { handleProjects } from './handlers/projects.js';
import { handleProject } from './handlers/project.js';
import { makeAgentHandler } from './handlers/agent.js';
import { makeMissionHandler } from './handlers/mission.js';
import { handleMissions } from './handlers/missions.js';
import { handleAudit } from './handlers/audit.js';
import { handleLogs } from './handlers/logs.js';
import { handleHelp } from './handlers/help.js';
import { handleFreetext } from './handlers/freetext.js';
import { handleWhoami } from './handlers/whoami.js';
import { makeDiscoverHandler } from './handlers/discover.js';
import { makePlanHandler } from './handlers/plan.js';
import { handleObjective } from './handlers/objective.js';
import { handleGm } from './handlers/gm.js';
import type { DiscoveryStore } from './discovery.js';

export class Router {
  private readonly handlers: Map<string, (ctx: CommandContext) => Promise<void>>;

  constructor(
    private readonly store: ConfirmationStore,
    discovery?: DiscoveryStore,
  ) {
    this.handlers = new Map();
    this.handlers.set('/status',   handleStatus);
    this.handlers.set('/projects', handleProjects);
    this.handlers.set('/project',  handleProject);
    this.handlers.set('/agent',    makeAgentHandler(store));
    this.handlers.set('/plan',     makePlanHandler(store));
    this.handlers.set('/mission',  makeMissionHandler(store));
    this.handlers.set('/missions', handleMissions);
    this.handlers.set('/audit',    handleAudit);
    this.handlers.set('/logs',     handleLogs);
    this.handlers.set('/help',     handleHelp);
    this.handlers.set('/whoami',   handleWhoami);
    this.handlers.set('/objective', handleObjective);
    this.handlers.set('/gm',        handleGm);
    if (discovery) {
      this.handlers.set('/discover', makeDiscoverHandler(discovery));
    }
    // /start is the Telegram "first contact" convention — route to /help.
    this.handlers.set('/start',    handleHelp);
  }

  async dispatch(
    message: TelegramMessage,
    config: GalaxiaConfig,
    client: TelegramClientLike,
  ): Promise<void> {
    // Auth gate — silent drop for non-whitelisted chats. See auth.ts: we
    // never send a "not authorised" message. A stranger gets nothing.
    const user = findUser(message.chat.id, config);
    if (!user) {
      return;
    }

    const text = message.text ?? '';
    if (!text.trim()) return;

    const ctx: CommandContext = {
      chatId: message.chat.id,
      messageId: message.message_id,
      args: [],
      rawText: text,
      config,
      client,
      tz: resolveTimezone(config.display?.timezone),
      message,
      currentUser: user,
    };

    // Command path: first token that starts with '/'. Shell-style quoted
    // args are supported so `/agent dev "fix the login"` yields one task arg.
    if (text.startsWith('/')) {
      const tokens = tokenize(text);
      const rawCmd = (tokens[0] ?? '').toLowerCase();
      // Telegram may bolt on a bot suffix: "/status@my_bot". Strip it.
      const cmd = rawCmd.replace(/@\w+$/, '');
      ctx.args = tokens.slice(1);

      const handler = this.handlers.get(cmd) ?? handleHelp;
      try {
        await handler(ctx);
      } catch (err) {
        // Never crash the poller — log + acknowledge failure to the user.
        const msg = (err as Error).message;
        try {
          await client.sendMessage(
            ctx.chatId,
            `⚠️ Erreur interne: ${msg.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')}`,
            { parse_mode: 'MarkdownV2' },
          );
        } catch { /* final fallback: silent */ }
      }
      return;
    }

    // Free text — conversation mode.
    try {
      await handleFreetext(ctx);
    } catch (err) {
      try {
        await client.sendMessage(
          ctx.chatId,
          `⚠️ Erreur LLM: ${(err as Error).message.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')}`,
          { parse_mode: 'MarkdownV2' },
        );
      } catch { /* silent */ }
    }
  }
}

// Tokenize a command line into args, honoring double/single quotes so a
// task like `/agent dev "fix the 404"` yields ['/agent', 'dev', 'fix the 404'].
// Backslash escapes inside quotes are not supported — Telegram operators
// usually type free-form text, no need for shell-grade quoting.
function tokenize(input: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}
