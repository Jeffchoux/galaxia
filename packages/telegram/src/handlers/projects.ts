// /projects — list every project declared in the config, with the health
// pulled from state.json (populated by runCycle).

import { existsSync, readFileSync } from 'node:fs';
import { stateFilePath } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2, timeSince } from '../format.js';

interface ProjectState {
  status?: string;
  lastCycle?: string;
  backlogCount?: number;
}

function loadProjects(dataDir: string): Record<string, ProjectState> {
  const path = stateFilePath(dataDir);
  if (!existsSync(path)) return {};
  try {
    const state = JSON.parse(readFileSync(path, 'utf-8')) as { projects?: Record<string, ProjectState> };
    return state.projects ?? {};
  } catch {
    return {};
  }
}

export async function handleProjects(ctx: CommandContext): Promise<void> {
  const projects = ctx.config.projects ?? [];
  if (projects.length === 0) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Aucun projet configuré dans galaxia.yml.'), {
      parse_mode: 'MarkdownV2',
    });
    return;
  }

  const states = loadProjects(ctx.config.dataDir);
  const lines: string[] = ['*Projets Galaxia*', ''];
  for (const p of projects) {
    const st = states[p.name] ?? {};
    const status = st.status ?? 'unknown';
    const last = st.lastCycle ? timeSince(st.lastCycle) : 'never';
    const backlog = typeof st.backlogCount === 'number' ? st.backlogCount : 0;
    lines.push(`• *${escapeMd2(p.name)}* — \`${escapeMd2(status)}\` · last: ${escapeMd2(last)} · backlog: ${backlog}`);
  }
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
