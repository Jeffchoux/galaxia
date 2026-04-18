// GALAXIA Telegram — public surface.

export { startTelegramBot, type StartTelegramBotOptions } from './server.js';
export { TelegramClient, type TelegramClientOptions } from './client.js';
export { Router } from './router.js';
export { Poller } from './poller.js';
export { ConfirmationStore, requestConfirmation } from './confirmation.js';
export { isAllowed } from './auth.js';
export { escapeMd2, formatInTz, timeSince, resolveTimezone } from './format.js';
export type {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramUser,
  TelegramChat,
  SendMessageOptions,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  CommandContext,
  PendingConfirmation,
  TelegramBotHandle,
  TelegramClientLike,
} from './types.js';
