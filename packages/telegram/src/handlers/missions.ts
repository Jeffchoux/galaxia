// /missions — list missions stored in missions.json, filtered to the
// active ones (pending | in_progress) by default. Passes through the
// plural-handler shape (no args).

import { existsSync, readFileSync } from 'node:fs';
import { missionsFilePath } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

interface StoredMission {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
}

export async function handleMissions(ctx: CommandContext): Promise<void> {
  const path = missionsFilePath(ctx.config.dataDir);
  if (!existsSync(path)) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Aucune mission enregistrée.'), { parse_mode: 'MarkdownV2' });
    return;
  }
  let all: StoredMission[] = [];
  try { all = JSON.parse(readFileSync(path, 'utf-8')) as StoredMission[]; } catch { /* keep empty */ }

  const active = all.filter((m) => m.status === 'pending' || m.status === 'in_progress');
  const completed = all.length - active.length;

  const lines: string[] = [`*Missions actives*: ${active.length}  ·  *complétées*: ${completed}`, ''];
  if (active.length === 0) {
    lines.push(escapeMd2('— aucune mission active'));
  } else {
    for (const m of active) {
      lines.push(`• \`${escapeMd2(m.id)}\` — \`${escapeMd2(m.status)}\` · ${escapeMd2(m.description.slice(0, 140))}`);
    }
  }
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
