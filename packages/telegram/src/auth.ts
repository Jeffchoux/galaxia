// GALAXIA Telegram — auth middleware (Phase 7 multi-user aware).
//
// Rule (from the phase 6 brief, preserved): never reveal whether a chat_id
// is known. Unauthorised chats get SILENT drop — no message, no callback
// answer, no "you are not authorised" reply.
//
// Phase 7 change: the whitelist is now sourced from `config.users[]` with
// `telegram.allowedChatIds` as legacy fallback when no users block exists.
// All the heavy lifting is in @galaxia/core/auth — we just re-expose it
// under the same shape the poller/router were already importing.

import type { GalaxiaConfig, GalaxiaUser } from '@galaxia/core';
import { findUserByTelegramChatId } from '@galaxia/core';

/**
 * Returns the authenticated user for this chat_id, or null if the chat is
 * not whitelisted. Router and Poller use this as the single auth gate.
 */
export function findUser(chatId: number, config: GalaxiaConfig): GalaxiaUser | null {
  return findUserByTelegramChatId(chatId, config);
}

/**
 * Boolean shortcut for call sites that only need "allowed vs not". Kept
 * for back-compat with anything outside the package that might have
 * imported `isAllowed` before Phase 7.
 */
export function isAllowed(chatId: number, config: GalaxiaConfig): boolean {
  return findUser(chatId, config) !== null;
}
