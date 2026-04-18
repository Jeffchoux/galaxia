// GALAXIA Telegram — auth middleware.
//
// Rule (from the phase 6 brief): never reveal whether a chat_id is known.
// Unauthorised chats get SILENT drop — no message, no callback answer, no
// "you are not authorised" reply. A stranger probing the bot should get the
// same behaviour as sending a message into the void.

import type { GalaxiaConfig } from '@galaxia/core';

/**
 * Returns true if the given chat_id appears in
 * `config.telegram.allowedChatIds`. Accepts both number and string in the
 * whitelist (YAML may load ${TELEGRAM_CHAT_ID} as string). The compare is
 * numeric when both sides parse as integers, string-equality otherwise.
 */
export function isAllowed(chatId: number, config: GalaxiaConfig): boolean {
  const allowed = config.telegram?.allowedChatIds;
  if (!allowed || allowed.length === 0) return false;
  for (const entry of allowed) {
    if (typeof entry === 'number' && entry === chatId) return true;
    if (typeof entry === 'string') {
      const n = Number(entry);
      if (Number.isFinite(n) && n === chatId) return true;
      if (entry === String(chatId)) return true;
    }
  }
  return false;
}
