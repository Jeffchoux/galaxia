// /audit [N] — last N routing decisions from routing-audit.jsonl. Wraps
// @galaxia/core's queryAudit so the output matches `galaxia routing audit`.

import { queryAudit } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2, formatInTz } from '../format.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export async function handleAudit(ctx: CommandContext): Promise<void> {
  let limit = DEFAULT_LIMIT;
  if (ctx.args[0]) {
    const n = parseInt(ctx.args[0], 10);
    if (Number.isFinite(n) && n > 0) limit = Math.min(n, MAX_LIMIT);
  }

  let entries;
  try {
    entries = queryAudit({ limit }, ctx.config);
  } catch (err) {
    await ctx.client.sendMessage(
      ctx.chatId,
      escapeMd2(`Audit indisponible: ${(err as Error).message}`),
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  if (entries.length === 0) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Aucune entrée d\'audit routing.'), { parse_mode: 'MarkdownV2' });
    return;
  }

  const lines: string[] = [`*Routing audit* — ${entries.length} dernière${entries.length > 1 ? 's' : ''}`];
  for (const e of entries) {
    const when = formatInTz(e.timestamp, ctx.tz);
    const prov = `${e.decision.provider}/${e.decision.model}`;
    const transport = e.decision.transport ? `/${e.decision.transport}` : '';
    const okIcon = e.success ? '✅' : '❌';
    lines.push(
      `${okIcon} \`${escapeMd2(when)}\` · \`${escapeMd2(String(e.context.taskType))}\` · \`${escapeMd2(String(e.context.dataClass))}\` → \`${escapeMd2(prov + transport)}\` · ${e.latencyMs}ms`,
    );
  }
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
