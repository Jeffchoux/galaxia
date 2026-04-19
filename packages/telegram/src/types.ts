// GALAXIA Telegram — shared types for the bidirectional bot (Pilier 3).

import type { GalaxiaConfig, GalaxiaUser } from '@galaxia/core';

// ── Telegram Bot API shapes (minimal subset) ───────────────────────────────
// We only model fields we actually read. Keep unknown-shape for fields we
// never inspect so an API change doesn't break the type-check.

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ── Inline keyboards ───────────────────────────────────────────────────────

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOptions {
  parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown';
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

// ── Internal types ─────────────────────────────────────────────────────────

// CommandContext is handed to every handler. It bundles the incoming
// message, parsed args, and the primitives the handler needs (config,
// client, timezone). Handlers never reach into the raw Update — the router
// is the only layer that translates Update → CommandContext.
export interface CommandContext {
  chatId: number;
  messageId: number;
  args: string[];
  rawText: string;
  config: GalaxiaConfig;
  client: TelegramClientLike;
  tz: string;
  // The full Telegram message, exposed for handlers that need metadata we
  // didn't bubble up (e.g. username for logging).
  message: TelegramMessage;
  // Phase 7 — the authenticated user behind this chat_id. Populated by the
  // router before it calls the handler. Handlers rely on this for scope
  // checks; see packages/core/src/auth.
  currentUser: GalaxiaUser;
}

// Subset of the full TelegramClient the handlers depend on. Keeps the
// handler-module surface stable when we add client methods.
export interface TelegramClientLike {
  sendMessage(chatId: number, text: string, options?: SendMessageOptions): Promise<TelegramMessage>;
  editMessageText(chatId: number, messageId: number, text: string, options?: SendMessageOptions): Promise<TelegramMessage | boolean>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean>;
}

// Pending confirmation tracked in-memory. Keyed by callback_data token that
// the inline keyboard ships with every click.
export interface PendingConfirmation {
  token: string;           // short random id embedded in callback_data
  action: string;          // e.g. 'dispatch-dev' — matches requiresConfirmation
  chatId: number;
  messageId: number;       // the bot message that carries the keyboard
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

// Handle returned by startTelegramBot() — lets the daemon stop the bot
// cleanly on SIGTERM.
export interface TelegramBotHandle {
  stop(): Promise<void>;
}
