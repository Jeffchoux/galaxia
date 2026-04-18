// /logs [N] — tail N lines of orchestrator.log.

import { existsSync, readFileSync } from 'node:fs';
import { logFilePath } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

const DEFAULT_TAIL = 20;
const MAX_TAIL = 100;

export async function handleLogs(ctx: CommandContext): Promise<void> {
  let tail = DEFAULT_TAIL;
  if (ctx.args[0]) {
    const n = parseInt(ctx.args[0], 10);
    if (Number.isFinite(n) && n > 0) tail = Math.min(n, MAX_TAIL);
  }

  const path = logFilePath(ctx.config.dataDir);
  if (!existsSync(path)) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Pas encore de logs (daemon jamais démarré).'), {
      parse_mode: 'MarkdownV2',
    });
    return;
  }

  let lines: string[];
  try {
    lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.length > 0);
  } catch (err) {
    await ctx.client.sendMessage(
      ctx.chatId,
      escapeMd2(`Impossible de lire les logs: ${(err as Error).message}`),
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  const selected = lines.slice(-tail);
  // Plain text inside a MarkdownV2 code fence is the safest way to render
  // arbitrary log lines without worrying about every reserved char. The
  // only thing we still need to escape is backticks and backslashes.
  const body = selected.join('\n').replace(/([`\\])/g, '\\$1');
  const header = `*Logs* — ${selected.length} dernière${selected.length > 1 ? 's' : ''} lignes`;
  // Telegram limit is ~4096 chars per message. If the fence would blow
  // past, truncate head-first.
  const MAX = 3900;
  const trimmed = body.length > MAX ? `…\n${body.slice(-MAX)}` : body;

  await ctx.client.sendMessage(ctx.chatId, `${header}\n\`\`\`\n${trimmed}\n\`\`\``, {
    parse_mode: 'MarkdownV2',
  });
}
