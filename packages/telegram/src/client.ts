// GALAXIA Telegram — HTTP client, no external deps (Node 20+ fetch).
//
// This is a thin wrapper: it knows how to call the four methods the bot
// needs (getUpdates, sendMessage, editMessageText, answerCallbackQuery) and
// it implements the MarkdownV2→plain-text fallback for sendMessage. No
// state is kept here — the poller owns the offset, confirmation.ts owns
// the pending map.

import type {
  TelegramApiResponse,
  TelegramUpdate,
  TelegramMessage,
  SendMessageOptions,
  TelegramClientLike,
} from './types.js';

// Fatal parse-entity error code surfaced by Telegram when our MarkdownV2
// escape misses a reserved char. Q3 of the brief: catch this specifically
// and retry in plain text so the operator still receives the content.
const MD_PARSE_ERROR_RE = /can't parse entities|can't find end of the entity/i;

export interface TelegramClientOptions {
  botToken: string;
  // Base URL override, used in tests to point at a fake server. Defaults to
  // the real Telegram API.
  baseUrl?: string;
  // Long-poll timeout passed to getUpdates, in seconds. The HTTP request's
  // own timeout is set to `pollTimeoutSec + 5s` so the socket is released
  // cleanly if Telegram doesn't answer. Default 30s.
  pollTimeoutSec?: number;
}

export class TelegramClient implements TelegramClientLike {
  private readonly baseUrl: string;
  private readonly pollTimeoutSec: number;

  constructor(opts: TelegramClientOptions) {
    if (!opts.botToken) throw new Error('TelegramClient: botToken is required');
    this.baseUrl = (opts.baseUrl ?? 'https://api.telegram.org') + `/bot${opts.botToken}`;
    this.pollTimeoutSec = opts.pollTimeoutSec ?? 30;
  }

  // Long-polling primitive. Returns the batch of updates since `offset`,
  // blocking up to pollTimeoutSec on Telegram's side. The caller advances
  // `offset` to max(update_id)+1 before the next call.
  async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    const url = `${this.baseUrl}/getUpdates`;
    const body = {
      offset,
      timeout: this.pollTimeoutSec,
      allowed_updates: ['message', 'callback_query'],
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((this.pollTimeoutSec + 5) * 1000),
    });
    const data = (await res.json()) as TelegramApiResponse<TelegramUpdate[]>;
    if (!data.ok) {
      throw new Error(`getUpdates failed: ${data.description ?? res.status} (code=${data.error_code ?? '?'})`);
    }
    return data.result ?? [];
  }

  // MarkdownV2 first, plain text on parse-entity failure. Other Telegram
  // errors (wrong chat_id, network) propagate so the caller can log them.
  async sendMessage(
    chatId: number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<TelegramMessage> {
    const primaryOpts: SendMessageOptions = options.parse_mode ? options : { parse_mode: 'MarkdownV2', ...options };
    try {
      return await this.callSendMessage(chatId, text, primaryOpts);
    } catch (err) {
      const msg = (err as Error).message;
      if (primaryOpts.parse_mode && MD_PARSE_ERROR_RE.test(msg)) {
        // Retry as plain text — drop parse_mode entirely so nothing is
        // interpreted. reply_markup survives so inline keyboards still work.
        const fallbackOpts: SendMessageOptions = { ...options };
        delete fallbackOpts.parse_mode;
        return this.callSendMessage(chatId, text, fallbackOpts);
      }
      throw err;
    }
  }

  private async callSendMessage(
    chatId: number,
    text: string,
    options: SendMessageOptions,
  ): Promise<TelegramMessage> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (options.parse_mode) payload.parse_mode = options.parse_mode;
    if (options.reply_markup) payload.reply_markup = options.reply_markup;
    if (options.disable_web_page_preview) payload.disable_web_page_preview = true;

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as TelegramApiResponse<TelegramMessage>;
    if (!data.ok || !data.result) {
      throw new Error(`sendMessage failed: ${data.description ?? res.status}`);
    }
    return data.result;
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<TelegramMessage | boolean> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    if (options.parse_mode) payload.parse_mode = options.parse_mode;
    if (options.reply_markup) payload.reply_markup = options.reply_markup;

    const attempt = async (body: Record<string, unknown>): Promise<TelegramMessage | boolean> => {
      const res = await fetch(`${this.baseUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as TelegramApiResponse<TelegramMessage | boolean>;
      if (!data.ok) {
        throw new Error(`editMessageText failed: ${data.description ?? res.status}`);
      }
      return data.result as TelegramMessage | boolean;
    };

    try {
      return await attempt(payload);
    } catch (err) {
      const msg = (err as Error).message;
      if (options.parse_mode && MD_PARSE_ERROR_RE.test(msg)) {
        const retry = { ...payload };
        delete retry.parse_mode;
        return attempt(retry);
      }
      throw err;
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    const payload: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (text) payload.text = text;
    const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as TelegramApiResponse<boolean>;
    if (!data.ok) {
      throw new Error(`answerCallbackQuery failed: ${data.description ?? res.status}`);
    }
    return data.result === true;
  }
}
