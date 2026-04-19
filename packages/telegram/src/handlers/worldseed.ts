// /worldseed <prompt> — Phase 11.
//
// Direct test of the Worldseed bridge. Owner-only because this can
// reach into the AGI's decision loop.

import { consultWorldseed, isOwner } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

export async function handleWorldseed(ctx: CommandContext): Promise<void> {
  if (!isOwner(ctx.currentUser)) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Commande inconnue. /help'), { parse_mode: 'MarkdownV2' });
    return;
  }
  const prompt = ctx.args.join(' ').replace(/^["']|["']$/g, '').trim();
  if (!prompt) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2('Usage: /worldseed <question libre>'),
      { parse_mode: 'MarkdownV2' });
    return;
  }

  await ctx.client.sendMessage(ctx.chatId,
    escapeMd2(`⏳ Consulting Worldseed (timeout 20 s)…`),
    { parse_mode: 'MarkdownV2' });

  try {
    // Tight timeout for interactive Telegram — 20s so we don't keep
    // Jeff waiting if the bridge isn't wired on Worldseed's side.
    const res = await consultWorldseed('free-form', prompt, ctx.config, {
      meta: { via: 'telegram', user: ctx.currentUser.name },
      timeoutMs: 20_000,
    });
    const source = res.source === 'worldseed' ? '🌌 Worldseed' : '↩️ Fallback LLM';
    const body = (res.text || '(vide)').slice(0, 3500);
    const extra = res.source === 'fallback-llm' && res.worldseedError
      ? `\n\n_${escapeMd2('Worldseed indisponible: ' + res.worldseedError)}_`
      : '';
    await ctx.client.sendMessage(ctx.chatId,
      `*${source}*\n\n${escapeMd2(body)}${extra}`,
      { parse_mode: 'MarkdownV2' });
  } catch (err) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`Erreur Worldseed: ${(err as Error).message}`),
      { parse_mode: 'MarkdownV2' });
  }
}
