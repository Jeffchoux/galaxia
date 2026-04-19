// GALAXIA Telegram — long polling loop with exponential backoff.
//
// Calls getUpdates in a loop, fans each update out to the router (for
// messages) or the confirmation store (for callback_query). Never throws
// — network errors trigger a backoff and a retry. Graceful shutdown via
// `stop()`, which flips the stopRequested flag so the next iteration exits.

import type { GalaxiaConfig } from '@galaxia/core';
import type { TelegramClient } from './client.js';
import type { Router } from './router.js';
import type { ConfirmationStore } from './confirmation.js';
import type { DiscoveryStore } from './discovery.js';
import type { TelegramUpdate } from './types.js';
import { findUser } from './auth.js';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export interface PollerOptions {
  client: TelegramClient;
  router: Router;
  confirmations: ConfirmationStore;
  discovery?: DiscoveryStore;
  config: GalaxiaConfig;
  log?: (msg: string) => void;
}

export class Poller {
  private stopRequested = false;
  private running = false;
  private offset = 0;
  private loopPromise: Promise<void> | null = null;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: PollerOptions) {
    this.log = opts.log ?? ((m) => console.error(`[telegram] ${m}`));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.loopPromise) {
      try { await this.loopPromise; } catch { /* swallowed */ }
    }
    this.running = false;
  }

  private async loop(): Promise<void> {
    let backoff = INITIAL_BACKOFF_MS;
    this.log(`poller start (offset=${this.offset})`);
    while (!this.stopRequested) {
      try {
        const updates = await this.opts.client.getUpdates(this.offset);
        backoff = INITIAL_BACKOFF_MS;
        for (const update of updates) {
          if (update.update_id >= this.offset) {
            this.offset = update.update_id + 1;
          }
          await this.handle(update);
        }
      } catch (err) {
        if (this.stopRequested) break;
        const msg = (err as Error).message;
        // AbortError / fetch timeouts are normal during long-polling when
        // no updates arrive — log at low volume, don't backoff.
        if (/aborted|timeout/i.test(msg)) {
          continue;
        }
        this.log(`poll error, backing off ${backoff}ms: ${msg}`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    this.log('poller stopped');
  }

  private async handle(update: TelegramUpdate): Promise<void> {
    const { router, confirmations, config, client } = this.opts;

    if (update.callback_query) {
      const q = update.callback_query;
      // Auth callback_query the same way as messages. Missing `message`
      // shouldn't happen for button clicks, but guard defensively.
      const chatId = q.message?.chat.id;
      if (chatId === undefined || !findUser(chatId, config)) {
        // Silent drop, but still close the Telegram spinner on the client
        // side so their UI doesn't hang. We can safely answer an
        // unauthorised callback — it doesn't reveal whitelist membership
        // because ANY stranger gets the same no-op close.
        try { await client.answerCallbackQuery(q.id); } catch { /* noop */ }
        return;
      }
      // Phase 8.5: discovery callbacks own the `dr:` namespace.
      if (this.opts.discovery && this.opts.discovery.isOwnData(q.data ?? '')) {
        await this.opts.discovery.handleCallback(q, config, client);
        return;
      }
      await confirmations.handleCallback(q, config, client);
      return;
    }

    if (update.message) {
      await router.dispatch(update.message, config, client);
      return;
    }
    // edited_message and other update types are ignored on purpose.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
