// /project <name> — detail view for one project: status, last 3
// knowledge entries, backlog snapshot.

import { existsSync, readFileSync } from 'node:fs';
import { stateFilePath, knowledgeFilePath, userCanAccess } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2, timeSince } from '../format.js';

function readKnowledgeTail(project: string, dataDir: string, tail: number): string[] {
  const path = knowledgeFilePath(project, dataDir);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    // Split on "## " headings (each entry starts with "## <category> - <date>").
    const entries = raw.split(/^##\s+/m).filter((e) => e.trim().length > 0);
    return entries.slice(-tail).map((e) => e.split('\n')[0]?.trim() ?? '');
  } catch {
    return [];
  }
}

export async function handleProject(ctx: CommandContext): Promise<void> {
  const name = ctx.args[0];
  if (!name) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Usage: /project <name>'), { parse_mode: 'MarkdownV2' });
    return;
  }
  const proj = (ctx.config.projects ?? []).find((p) => p.name === name);
  // Phase 7 — scope check. If the user can't see this project we respond
  // exactly like when the project doesn't exist. Never reveal the
  // difference between "out of scope" and "not configured" — that would
  // leak the existence of other projects.
  if (!proj || !userCanAccess(ctx.currentUser, proj.name)) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2(`Projet "${name}" introuvable.`), {
      parse_mode: 'MarkdownV2',
    });
    return;
  }

  // Project state
  let status = 'unknown';
  let lastCycle: string | undefined;
  let backlogCount = 0;
  let nextPriority: string | undefined;
  try {
    const state = JSON.parse(readFileSync(stateFilePath(ctx.config.dataDir), 'utf-8')) as {
      projects?: Record<string, { status?: string; lastCycle?: string; backlogCount?: number; nextPriority?: string }>;
    };
    const st = state.projects?.[name];
    if (st) {
      status = st.status ?? status;
      lastCycle = st.lastCycle;
      backlogCount = st.backlogCount ?? 0;
      nextPriority = st.nextPriority;
    }
  } catch { /* no state yet */ }

  const knowledge = readKnowledgeTail(name, ctx.config.dataDir, 3);

  const lines: string[] = [];
  lines.push(`*Projet: ${escapeMd2(name)}*`);
  lines.push(`Path: \`${escapeMd2(proj.path)}\``);
  if (proj.pm2Name) lines.push(`PM2: \`${escapeMd2(proj.pm2Name)}\``);
  lines.push(`Status: \`${escapeMd2(status)}\``);
  lines.push(`Backlog: \`${backlogCount}\``);
  lines.push(`Last cycle: ${escapeMd2(lastCycle ? timeSince(lastCycle) : 'never')}`);
  if (nextPriority && nextPriority !== 'none') lines.push(`Next: ${escapeMd2(nextPriority)}`);
  lines.push('');
  lines.push('*Knowledge (3 dernières):*');
  if (knowledge.length === 0) {
    lines.push(escapeMd2('— aucune entrée'));
  } else {
    for (const k of knowledge) lines.push(`• ${escapeMd2(k)}`);
  }

  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
