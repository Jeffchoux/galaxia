// /gm <project> [pause|resume] — Phase 10.
//
// Without a subcommand: render the current GMState (objectifs, dernière
// décision, next review). With `pause`/`resume`: flip the boolean in
// gm-state.json. The actual loop polls `state.paused` on each tick, so
// the change takes effect at the next review without restart.

import { userCanAccess, ProjectGM } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2, timeSince } from '../format.js';

export async function handleGm(ctx: CommandContext): Promise<void> {
  const projectName = ctx.args[0];
  const sub = ctx.args[1];
  if (!projectName) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2('Usage: /gm <project> [pause|resume]'),
      { parse_mode: 'MarkdownV2' });
    return;
  }
  const project = (ctx.config.projects ?? []).find((p) => p.name === projectName);
  if (!project || !userCanAccess(ctx.currentUser, project.name)) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`Projet "${projectName}" introuvable.`),
      { parse_mode: 'MarkdownV2' });
    return;
  }

  const gm = new ProjectGM(project, project.gm, ctx.config);

  if (sub === 'pause') {
    gm.pause();
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`⏸ GM de "${project.name}" mis en pause.`),
      { parse_mode: 'MarkdownV2' });
    return;
  }
  if (sub === 'resume') {
    gm.resume();
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`▶️ GM de "${project.name}" relancé.`),
      { parse_mode: 'MarkdownV2' });
    return;
  }

  const state = gm.getState();
  const last = state.recentActions.at(-1);
  const lines = [
    `*GM — ${escapeMd2(project.name)}*`,
    `Enabled: \`${state.enabled}\` · Paused: \`${state.paused}\` · Cycles: \`${state.cyclesRun}\``,
    `Health: \`${state.healthScore.toFixed(2)}\``,
    '',
    `*Objectifs* (${state.currentObjectives.length}):`,
  ];
  if (state.currentObjectives.length === 0) {
    lines.push(escapeMd2('— aucun'));
  } else {
    for (const o of state.currentObjectives) {
      lines.push(`• \`${escapeMd2(o.id)}\` ${escapeMd2(o.description.slice(0, 120))}`);
    }
  }
  lines.push('', '*Dernière décision*:');
  if (last) {
    const header = `${last.kind}${last.agent ? ' · ' + last.agent : ''}${last.task ? ' · ' + last.task.slice(0, 60) : ''}`;
    lines.push(`${escapeMd2(header)}`);
    lines.push(`_${escapeMd2(last.reason.slice(0, 200))}_`);
    lines.push(`${escapeMd2(timeSince(last.ts))}`);
  } else {
    lines.push(escapeMd2('— aucune action journalisée'));
  }
  if (state.nextReviewAt) {
    lines.push('', `Next review: ${escapeMd2(state.nextReviewAt)}`);
  }
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
