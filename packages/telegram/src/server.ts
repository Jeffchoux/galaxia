// GALAXIA Telegram — startTelegramBot() entrypoint.
//
// Wires the client, router, confirmation store, and poller together.
// Returns a handle the daemon (packages/cli/src/cli.ts) uses to stop the
// bot on SIGTERM. Safe to call even if telegram is disabled in config — it
// just no-ops in that case, so the binding site doesn't need defensive
// checks.

import type { GalaxiaConfig } from '@galaxia/core';
import { TelegramClient } from './client.js';
import { Router } from './router.js';
import { ConfirmationStore } from './confirmation.js';
import { DiscoveryStore } from './discovery.js';
import { Poller } from './poller.js';
import type { TelegramBotHandle } from './types.js';

export interface StartTelegramBotOptions {
  // Optional injection points used by tests. In production callers pass
  // just the config; the defaults build real Telegram instances.
  clientFactory?: (config: GalaxiaConfig) => TelegramClient;
  log?: (msg: string) => void;
  // Confirmation TTL override (ms). Real code uses 60_000 (per brief Q2);
  // tests can shrink this to make timeout scenarios finish in seconds.
  confirmationTtlMs?: number;
}

export async function startTelegramBot(
  config: GalaxiaConfig,
  options: StartTelegramBotOptions = {},
): Promise<TelegramBotHandle> {
  const log = options.log ?? ((m) => console.error(`[telegram] ${m}`));

  if (!config.telegram?.enabled) {
    log('disabled in config — not starting');
    return { stop: async () => { /* noop */ } };
  }
  if (!config.telegram.botToken) {
    log('no bot token configured — not starting');
    return { stop: async () => { /* noop */ } };
  }
  // Phase 7: accept either the legacy `telegram.allowedChatIds` whitelist
  // or the new `config.users[]` multi-user block. Refuse to start only if
  // BOTH are empty — the bot would be unreachable in that case.
  const legacyIds = config.telegram.allowedChatIds ?? [];
  const hasUsers = (config.users ?? []).some((u) => (u.auth?.telegramChatIds ?? []).length > 0);
  if (legacyIds.length === 0 && !hasUsers) {
    log('no telegram identities configured (users[] empty and allowedChatIds empty) — refusing to start');
    return { stop: async () => { /* noop */ } };
  }

  const client = options.clientFactory
    ? options.clientFactory(config)
    : new TelegramClient({
        botToken: config.telegram.botToken,
        pollTimeoutSec: Math.max(1, Math.floor((config.telegram.pollingIntervalMs ?? 30_000) / 1000)),
      });

  const confirmations = new ConfirmationStore(options.confirmationTtlMs);
  confirmations.startSweeper(client);

  const discovery = new DiscoveryStore();
  discovery.startSweeper(client);

  const router = new Router(confirmations, discovery);
  const poller = new Poller({ client, router, confirmations, discovery, config, log });
  poller.start();
  const users = config.users ?? [];
  const summary = users.length > 0
    ? `users=[${users.map((u) => `${u.name}(${u.role},${u.scope.join('|')})`).join(',')}]`
    : `allowedChatIds=[${legacyIds.join(',')}]`;
  log(`bot started — ${summary}`);

  return {
    async stop() {
      log('stopping bot…');
      await poller.stop();
      confirmations.stop();
      discovery.stop();
      log('bot stopped');
    },
  };
}
