// /plan <agent> "<task>" — Phase 9 dry-run preview.
//
// Dispatches the named agent, prints the proposed plan (if any) and the
// action-runner dry-run verdict for each step. If the plan passes all
// permission checks, offers [✅ Apply] [❌ Annuler] on an inline keyboard.
// Apply re-runs through execute() in 'apply' mode; cancel just edits the
// carrier message.

import type { AgentType } from '@galaxia/core';
import { renderPlanLine, validatePlan, execute } from '@galaxia/core';
import { getAgent, type AgentContext } from '@galaxia/agents';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';
import { ConfirmationStore, requestConfirmation } from '../confirmation.js';

const AGENT_TYPES: AgentType[] = [
  'dev', 'cicd', 'test', 'analyse', 'controle',
  'veille', 'ideas', 'contenu', 'review', 'maintenance',
];

export function makePlanHandler(store: ConfirmationStore) {
  return async function handlePlan(ctx: CommandContext): Promise<void> {
    const type = ctx.args[0] as AgentType | undefined;
    const task = ctx.args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();

    if (!type || !task) {
      await ctx.client.sendMessage(ctx.chatId,
        escapeMd2('Usage: /plan <agent> "<task>"'),
        { parse_mode: 'MarkdownV2' });
      return;
    }
    if (!AGENT_TYPES.includes(type)) {
      await ctx.client.sendMessage(ctx.chatId,
        escapeMd2(`Agent type inconnu: ${type}. Valides: ${AGENT_TYPES.join(', ')}`),
        { parse_mode: 'MarkdownV2' });
      return;
    }

    // Scope: same rule as /agent — pick the first project the user can
    // see. In theory we could let the user name a project; brief v1
    // keeps /plan implicit to avoid arg parsing drift.
    const projects = ctx.config.projects ?? [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- userCanAccess via core export
    const { userCanAccess } = await import('@galaxia/core');
    const project = projects.find((p) => userCanAccess(ctx.currentUser, p.name));
    if (!project) {
      await ctx.client.sendMessage(ctx.chatId,
        escapeMd2('Aucun projet dans votre scope — impossible de planifier.'),
        { parse_mode: 'MarkdownV2' });
      return;
    }

    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`🧠 ${type} réfléchit (projet: ${project.name})…`),
      { parse_mode: 'MarkdownV2' });

    const agent = getAgent(type);
    const agentCtx: AgentContext = { project, config: ctx.config, dataDir: ctx.config.dataDir };
    const result = await agent.run(task, agentCtx);

    // No plan produced — show the agent's summary and stop.
    if (!result.plan || result.plan.length === 0) {
      const lines = [
        `*Pas de plan proposé par* \`${escapeMd2(type)}\``,
        '',
        escapeMd2(result.summary.slice(0, 1500)),
      ];
      await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
      return;
    }

    // Dry-run + permission validation.
    const check = validatePlan(result.plan, project, ctx.config);
    const dryResults = await execute(result.plan, project, ctx.config, { mode: 'dry-run' });

    const lines: string[] = [];
    lines.push(`*Plan de* \`${escapeMd2(type)}\` *pour* \`${escapeMd2(project.name)}\``);
    lines.push('');
    result.plan.forEach((action, i) => {
      const r = dryResults[i]!;
      const icon = r.success ? '✓' : '✗';
      lines.push(`${icon} ${escapeMd2(renderPlanLine(action))}`);
      if (!r.success && r.error) lines.push(`   ⚠️ ${escapeMd2(r.error)}`);
      if (action.reason) lines.push(`   _${escapeMd2(action.reason)}_`);
    });

    if (!check.ok) {
      lines.push('', `*Plan refusé:* ${check.failures.length} action\\(s\\) hors permissions\\.`);
      await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
      return;
    }

    // Plan passes dry-run — offer apply. Always gated by confirmation
    // even when `actionRunner.defaultMode === 'apply'`: /plan is the
    // "preview then apply" workflow, so the inline keyboard is the UX
    // contract.
    const action = 'action-plan-apply';
    const headline = lines.join('\n');
    await requestConfirmation(store, ctx, action, headline, {
      projectName: project.name,
      planJson: JSON.stringify(result.plan),
    }, async (payload, config, client, chatId) => {
      const name = payload.projectName as string;
      const plan = JSON.parse(payload.planJson as string);
      const proj = (config.projects ?? []).find((p) => p.name === name);
      if (!proj) {
        await client.sendMessage(chatId, escapeMd2(`Projet "${name}" introuvable au moment de l'apply.`), { parse_mode: 'MarkdownV2' });
        return;
      }
      const applied = await execute(plan, proj, config, { mode: 'apply' });
      const replyLines = [`*Apply ${escapeMd2(name)}*`, ''];
      applied.forEach((r) => {
        const icon = r.success ? '✅' : '❌';
        replyLines.push(`${icon} ${escapeMd2(r.kind)} — ${escapeMd2(r.summary)}`);
        if (!r.success && r.error) replyLines.push(`   ⚠️ ${escapeMd2(r.error)}`);
      });
      await client.sendMessage(chatId, replyLines.join('\n'), { parse_mode: 'MarkdownV2' });
    });
  };
}
