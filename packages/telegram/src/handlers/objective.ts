// /objective <project> "<text>" — Phase 10.
// Injects a new high-level objective into the GM state for <project>.
// Scoped: a user without access to the project gets "introuvable".

import { userCanAccess, ProjectGM } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

export async function handleObjective(ctx: CommandContext): Promise<void> {
  const projectName = ctx.args[0];
  const text = ctx.args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
  if (!projectName || !text) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2('Usage: /objective <project> "<texte>"'),
      { parse_mode: 'MarkdownV2' });
    return;
  }
  const project = (ctx.config.projects ?? []).find((p) => p.name === projectName);
  if (!project || !userCanAccess(ctx.currentUser, project.name)) {
    // Same discretion rule as /project: don't reveal the existence of
    // projects the user isn't scoped to.
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`Projet "${projectName}" introuvable.`),
      { parse_mode: 'MarkdownV2' });
    return;
  }
  const gm = new ProjectGM(project, project.gm, ctx.config);
  const obj = gm.addObjective(text, ctx.currentUser.name);
  const lines = [
    `✅ Objectif ajouté pour *${escapeMd2(project.name)}*`,
    `Id: \`${escapeMd2(obj.id)}\``,
    `> ${escapeMd2(obj.description)}`,
  ];
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
