// /agent <type> "<task>" — dispatch a built-in agent role through
// @galaxia/agents. If the agent type is listed in
// telegram.requiresConfirmation as `dispatch-<type>`, route through the
// inline-keyboard confirmation flow first.

import type { AgentType } from '@galaxia/core';
import { userCanAccess } from '@galaxia/core';
import { getAgent, type AgentContext } from '@galaxia/agents';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';
import { ConfirmationStore, requestConfirmation } from '../confirmation.js';

const AGENT_TYPES: AgentType[] = [
  'dev', 'cicd', 'test', 'analyse', 'controle',
  'veille', 'ideas', 'contenu', 'review', 'maintenance',
];

export function makeAgentHandler(store: ConfirmationStore) {
  return async function handleAgent(ctx: CommandContext): Promise<void> {
    const type = ctx.args[0] as AgentType | undefined;
    const task = ctx.args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();

    if (!type || !task) {
      await ctx.client.sendMessage(
        ctx.chatId,
        escapeMd2('Usage: /agent <type> "<task>"'),
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }
    if (!AGENT_TYPES.includes(type)) {
      await ctx.client.sendMessage(
        ctx.chatId,
        escapeMd2(`Agent type inconnu: ${type}. Valides: ${AGENT_TYPES.join(', ')}`),
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const action = `dispatch-${type}`;
    const headline = `🤖 *Dispatch agent* \`${escapeMd2(type)}\`\nTâche: ${escapeMd2(task)}`;

    if (store.isGated(action, ctx.config)) {
      await requestConfirmation(store, ctx, action, headline, { type, task }, async (payload, _config, client, chatId) => {
        await runAgentAndReport(payload.type as AgentType, payload.task as string, ctx, client, chatId);
      });
      return;
    }

    // Immediate execute.
    await runAgentAndReport(type, task, ctx, ctx.client, ctx.chatId);
  };
}

async function runAgentAndReport(
  type: AgentType,
  task: string,
  ctx: CommandContext,
  client: CommandContext['client'],
  chatId: number,
): Promise<void> {
  const agent = getAgent(type);
  // AgentContext needs a project. Phase 7 — pick the first project the
  // current user can actually access; if none, synthesise a placeholder.
  // A user with empty scope gets the placeholder (routing still works but
  // won't match any project-specific rule).
  const projects = ctx.config.projects ?? [];
  const project = projects.find((p) => userCanAccess(ctx.currentUser, p.name)) ?? {
    name: 'telegram-ad-hoc',
    path: ctx.config.dataDir,
  };
  const agentCtx: AgentContext = { project, config: ctx.config, dataDir: ctx.config.dataDir };

  await client.sendMessage(chatId, escapeMd2(`⏳ ${type} démarre sur "${task}"…`), { parse_mode: 'MarkdownV2' });
  try {
    const result = await agent.run(task, agentCtx);
    const icon = result.success ? '✅' : '⚠️';
    const lines = [`${icon} *${escapeMd2(type)}* terminé`];
    if (result.summary) lines.push('', escapeMd2(result.summary.slice(0, 2000)));
    if (result.actions.length > 0) {
      lines.push('', '*Actions:*');
      for (const a of result.actions.slice(0, 10)) lines.push(`• ${escapeMd2(a)}`);
    }
    if (result.errors.length > 0) {
      lines.push('', '*Errors:*');
      for (const e of result.errors.slice(0, 5)) lines.push(`• ${escapeMd2(e)}`);
    }
    await client.sendMessage(chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
  } catch (err) {
    await client.sendMessage(chatId, escapeMd2(`❌ ${type} a échoué: ${(err as Error).message}`), {
      parse_mode: 'MarkdownV2',
    });
  }
}
