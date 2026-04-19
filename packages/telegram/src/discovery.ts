// GALAXIA Telegram — Phase 8.5 GitHub discovery store.
//
// Parallel to ConfirmationStore: handles the 3-button inline keyboard the
// /discover command ships per repo ([✅ Créer pièce] [❌ Archiver]
// [⏭️ Ignorer]). Callback data format is `dr:<token>:<kind>` where kind ∈
// {c, a, i} (create / archive / ignore).
//
// Lives as its own store so ConfirmationStore's 2-button c/x contract
// stays simple. Poller dispatches dr: to this store, everything else to
// ConfirmationStore.

import { randomBytes } from 'node:crypto';
import type { GalaxiaConfig } from '@galaxia/core';
import { createRoom, archiveRepo } from '@galaxia/core';
import type { TelegramCallbackQuery, TelegramClientLike } from './types.js';
import { escapeMd2 } from './format.js';

const DEFAULT_TTL_MS = 5 * 60_000; // 5 min — discovery session is longer than a one-shot confirm
const SWEEP_INTERVAL_MS = 30_000;

interface Entry {
  token: string;
  chatId: number;
  messageId: number;
  repoFullName: string;       // "owner/name"
  description: string;
  createdAt: number;
  expiresAt: number;
}

export class DiscoveryStore {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = DEFAULT_TTL_MS) { this.ttlMs = ttlMs; }

  create(
    chatId: number,
    repoFullName: string,
    description: string,
  ): { token: string; keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const token = randomBytes(8).toString('hex');
    const now = Date.now();
    this.entries.set(token, {
      token, chatId, messageId: 0, repoFullName, description,
      createdAt: now, expiresAt: now + this.ttlMs,
    });
    return {
      token,
      keyboard: [[
        { text: '✅ Créer pièce', callback_data: `dr:${token}:c` },
        { text: '❌ Archiver',    callback_data: `dr:${token}:a` },
        { text: '⏭️ Ignorer',     callback_data: `dr:${token}:i` },
      ]],
    };
  }

  setMessageId(token: string, messageId: number): void {
    const e = this.entries.get(token);
    if (e) e.messageId = messageId;
  }

  isOwnData(data: string): boolean {
    return /^dr:[0-9a-f]{16}:[cai]$/.test(data);
  }

  async handleCallback(
    query: TelegramCallbackQuery,
    config: GalaxiaConfig,
    client: TelegramClientLike,
  ): Promise<boolean> {
    const data = query.data ?? '';
    const match = /^dr:([0-9a-f]{16}):([cai])$/.exec(data);
    if (!match) return false;
    const token = match[1];
    const kind = match[2];
    const entry = this.entries.get(token);
    if (!entry) {
      try { await client.answerCallbackQuery(query.id, 'Session expirée ou déjà traitée.'); } catch { /* ignore */ }
      return true;
    }
    this.entries.delete(token);

    const repo = entry.repoFullName;
    try {
      if (kind === 'i') {
        await safeEdit(client, entry.chatId, entry.messageId,
          `⏭️ Ignoré: \`${escapeMd2(repo)}\``);
        try { await client.answerCallbackQuery(query.id, 'Ignoré'); } catch { /* ignore */ }
        return true;
      }
      if (kind === 'a') {
        await archiveRepo(repo);
        await safeEdit(client, entry.chatId, entry.messageId,
          `❌ Archivé: \`${escapeMd2(repo)}\``);
        try { await client.answerCallbackQuery(query.id, 'Archivé'); } catch { /* ignore */ }
        return true;
      }
      // kind === 'c' — create
      const res = await createRoom(repo, config, { description: entry.description });
      const body = res.alreadyDeclared
        ? `Déjà déclarée dans galaxia.yml; clone vérifié/refait sur \`${escapeMd2(res.path)}\`.`
        : `Pièce ajoutée à galaxia.yml, clone sur \`${escapeMd2(res.path)}\`.`;
      await safeEdit(client, entry.chatId, entry.messageId,
        `✅ Créée: \`${escapeMd2(repo)}\`\n${body}`);
      try { await client.answerCallbackQuery(query.id, 'Créée'); } catch { /* ignore */ }
    } catch (err) {
      const msg = (err as Error).message;
      await safeEdit(client, entry.chatId, entry.messageId,
        `⚠️ Erreur sur \`${escapeMd2(repo)}\`: ${escapeMd2(msg)}`);
      try { await client.answerCallbackQuery(query.id, 'Échec'); } catch { /* ignore */ }
    }
    return true;
  }

  startSweeper(client: TelegramClientLike): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => { void this.sweep(client); }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) { clearInterval(this.sweepTimer); this.sweepTimer = null; }
  }

  private async sweep(client: TelegramClientLike): Promise<void> {
    const now = Date.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt > now) continue;
      this.entries.delete(token);
      await safeEdit(client, entry.chatId, entry.messageId,
        `⏱️ Expiré: \`${escapeMd2(entry.repoFullName)}\``);
    }
  }

  /** @internal */ size(): number { return this.entries.size; }
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
  } catch { /* already edited / message gone — non fatal */ }
}
