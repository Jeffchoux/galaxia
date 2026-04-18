// GALAXIA Telegram — confirmation flow for irreversible actions.
//
// Q2 of the phase 6 brief: when a command matches an ID listed in
// `config.telegram.requiresConfirmation`, the bot doesn't execute it
// immediately. It sends an inline-keyboard message ("Confirmer" / "Annuler")
// and stashes the intent in an in-memory Map keyed by a short token. A
// callback_query carrying that token resolves the pending intent.
// Expired pendings (default 60s) are swept on a timer and their carrier
// message is edited to "Expiré".

import { randomBytes } from 'node:crypto';
import type { GalaxiaConfig } from '@galaxia/core';
import type {
  CommandContext,
  PendingConfirmation,
  TelegramCallbackQuery,
  TelegramClientLike,
} from './types.js';
import { escapeMd2 } from './format.js';

const DEFAULT_TTL_MS = 60_000;
const SWEEP_INTERVAL_MS = 10_000;

// Action that runs when the user clicks "Confirmer". Receives the original
// payload the handler stashed alongside the pending, plus the client so it
// can reply. Must resolve quickly — any long-running work should itself be
// awaited before returning, so the "Confirmer" click feels synchronous.
export type ConfirmExecutor = (
  payload: Record<string, unknown>,
  config: GalaxiaConfig,
  client: TelegramClientLike,
  chatId: number,
) => Promise<void>;

interface Entry extends PendingConfirmation {
  executor: ConfirmExecutor;
}

export class ConfirmationStore {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private onExpire: ((entry: PendingConfirmation) => void | Promise<void>) | null = null;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  setExpireHandler(handler: (entry: PendingConfirmation) => void | Promise<void>): void {
    this.onExpire = handler;
  }

  // Returns true when `action` is listed in config.telegram.requiresConfirmation.
  // The handler consults this before deciding between direct-execute and
  // request-confirmation.
  isGated(action: string, config: GalaxiaConfig): boolean {
    const list = config.telegram?.requiresConfirmation ?? [];
    return list.includes(action);
  }

  // Register a pending confirmation. Returns the two inline keyboard buttons
  // (confirm/cancel) with callback_data already populated. The caller sends
  // the carrier message, then back-fills `messageId` via `setMessageId()`.
  create(
    action: string,
    chatId: number,
    payload: Record<string, unknown>,
    executor: ConfirmExecutor,
  ): { token: string; keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const token = randomBytes(8).toString('hex');
    const now = Date.now();
    const entry: Entry = {
      token,
      action,
      chatId,
      messageId: 0, // populated by setMessageId()
      payload,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      executor,
    };
    this.entries.set(token, entry);
    return {
      token,
      keyboard: [[
        { text: '✅ Confirmer', callback_data: `c:${token}` },
        { text: '❌ Annuler',   callback_data: `x:${token}` },
      ]],
    };
  }

  setMessageId(token: string, messageId: number): void {
    const entry = this.entries.get(token);
    if (entry) entry.messageId = messageId;
  }

  // Handle a callback_query: if its data matches a pending we own, resolve
  // it (confirm or cancel) and remove it. Returns true if the query was
  // owned by this store. The poller should always answerCallbackQuery
  // regardless, so Telegram stops the spinner on the button.
  async handleCallback(
    query: TelegramCallbackQuery,
    config: GalaxiaConfig,
    client: TelegramClientLike,
  ): Promise<boolean> {
    const data = query.data ?? '';
    const match = /^([cx]):([0-9a-f]{16})$/.exec(data);
    if (!match) return false;
    const kind = match[1];
    const token = match[2];
    const entry = this.entries.get(token);
    if (!entry) {
      // Expired or unknown — tell the user politely.
      try {
        await client.answerCallbackQuery(query.id, 'Action expirée ou déjà traitée.');
      } catch { /* ignore */ }
      return true;
    }
    this.entries.delete(token);

    if (kind === 'x') {
      await safeEdit(client, entry.chatId, entry.messageId, `❌ Annulé: ${escapeMd2(entry.action)}`);
      try { await client.answerCallbackQuery(query.id, 'Annulé'); } catch { /* ignore */ }
      return true;
    }

    // Confirmer → execute. We swallow executor errors here so a bad action
    // never crashes the poller, but we surface the message to the user.
    try {
      await entry.executor(entry.payload, config, client, entry.chatId);
      await safeEdit(client, entry.chatId, entry.messageId, `✅ Confirmé: ${escapeMd2(entry.action)}`);
      try { await client.answerCallbackQuery(query.id, 'Confirmé'); } catch { /* ignore */ }
    } catch (err) {
      const msg = (err as Error).message;
      await safeEdit(client, entry.chatId, entry.messageId, `⚠️ Erreur: ${escapeMd2(msg)}`);
      try { await client.answerCallbackQuery(query.id, 'Échec'); } catch { /* ignore */ }
    }
    return true;
  }

  startSweeper(client: TelegramClientLike): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => { void this.sweep(client); }, SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive just for the sweeper.
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // Test helpers ----------------------------------------------------------
  /** @internal */ size(): number { return this.entries.size; }
  /** @internal */ has(token: string): boolean { return this.entries.has(token); }
  /** @internal */ forceSweep(client: TelegramClientLike): Promise<void> { return this.sweep(client); }

  private async sweep(client: TelegramClientLike): Promise<void> {
    const now = Date.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt > now) continue;
      this.entries.delete(token);
      await safeEdit(client, entry.chatId, entry.messageId, `⏱️ Expiré: ${escapeMd2(entry.action)} (timeout)`);
      if (this.onExpire) {
        try { await this.onExpire(entry); } catch { /* ignore */ }
      }
    }
  }
}

async function safeEdit(
  client: TelegramClientLike,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  if (!messageId) return;
  try {
    await client.editMessageText(chatId, messageId, text, { parse_mode: 'MarkdownV2' });
  } catch { /* already edited, message gone, etc — non-fatal */ }
}

// Helper used by handlers: send the carrier message with the confirm/cancel
// keyboard and link it back to the store. Kept in this module so handler
// code stays linear.
export async function requestConfirmation(
  store: ConfirmationStore,
  ctx: CommandContext,
  action: string,
  headline: string,
  payload: Record<string, unknown>,
  executor: ConfirmExecutor,
): Promise<void> {
  const { token, keyboard } = store.create(action, ctx.chatId, payload, executor);
  const text = `${headline}\n\nConfirmer dans 60 secondes, sinon l'action expirera.`;
  const sent = await ctx.client.sendMessage(ctx.chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: { inline_keyboard: keyboard },
  });
  store.setMessageId(token, sent.message_id);
}
