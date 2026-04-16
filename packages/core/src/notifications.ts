// GALAXIA Notifications — Telegram + Discord

import type { GalaxiaConfig } from './types.js';

/**
 * Send a message via Telegram Bot API.
 */
export async function sendTelegram(message: string, config: GalaxiaConfig): Promise<void> {
  const tg = config.notifications.telegram;
  if (!tg?.botToken || !tg?.chatId) {
    console.error('[notify] Telegram not configured, skipping');
    return;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${tg.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tg.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[notify] Telegram error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error('[notify] Telegram failed:', (err as Error).message);
  }
}

/**
 * Send a message via Discord webhook.
 */
export async function sendDiscord(message: string, config: GalaxiaConfig): Promise<void> {
  const dc = config.notifications.discord;
  if (!dc?.webhookUrl) {
    console.error('[notify] Discord not configured, skipping');
    return;
  }

  try {
    const res = await fetch(dc.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[notify] Discord error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error('[notify] Discord failed:', (err as Error).message);
  }
}

/**
 * Send to all configured notification channels.
 */
export async function notify(message: string, config: GalaxiaConfig): Promise<void> {
  const promises: Promise<void>[] = [];

  if (config.notifications.telegram) {
    promises.push(sendTelegram(message, config));
  }
  if (config.notifications.discord) {
    promises.push(sendDiscord(message, config));
  }

  if (promises.length === 0) {
    console.error('[notify] No notification channels configured');
    return;
  }

  await Promise.allSettled(promises);
}
