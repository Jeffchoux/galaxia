// <free text> — any incoming message that isn't a /command. Routes
// through callLLM with dataClass='personal', taskType='analysis'. Per the
// manifesto (§ 3.bis) and Q1 of the phase 6 brief, this audit-traces
// automatically because callLLM writes to routing-audit.jsonl.

import { callLLM } from '@galaxia/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandContext } from '../types.js';
import { userCanAccess } from '@galaxia/core';
import { escapeMd2 } from '../format.js';

// Hard cap so a runaway LLM response can't exceed Telegram's 4096-char
// limit. Messages longer than this are truncated with an ellipsis.
const MAX_REPLY_CHARS = 3800;

function buildGalaxiaContext(ctx: CommandContext): string {
  const allProjects = ctx.config.projects ?? [];
  const visible = allProjects.filter((p) => userCanAccess(ctx.currentUser, p.name));

  let stateSummary = '';
  try {
    const statePath = join(ctx.config.dataDir ?? '/root/galaxia-data', 'state', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
      projects?: Record<string, { status?: string; lastCycle?: string; backlogCount?: number; nextPriority?: string }>;
      daemon?: { pid?: number; cycleCount?: number; lastCycle?: string };
    };
    const perProject = Object.entries(state.projects ?? {})
      .filter(([name]) => visible.some((p) => p.name === name))
      .map(([name, s]) => `  - ${name}: ${s.status ?? '?'} | backlog=${s.backlogCount ?? 0} | last cycle=${s.lastCycle ?? '?'} | next: ${(s.nextPriority ?? '-').slice(0, 80)}`)
      .join('\n');
    if (perProject) stateSummary = `\nÉtat runtime des projets:\n${perProject}`;
    if (state.daemon) stateSummary += `\nDaemon Galaxia: PID=${state.daemon.pid ?? '?'}, cycles=${state.daemon.cycleCount ?? 0}, last=${state.daemon.lastCycle ?? '?'}`;
  } catch {
    /* state file missing — ignore */
  }

  const projectsList = visible.map((p) => {
    const gm = p.gm?.enabled ? `GM actif (${p.gm.intervalMinutes ?? '?'}min)` : 'GM inactif';
    return `  - ${p.name}: ${gm} — ${(p.description ?? '').slice(0, 100)}`;
  }).join('\n');

  return `CONTEXTE GALAXIA (injecté automatiquement — utilise ces infos pour répondre factuellement):
Tu es l'assistant conversationnel de Galaxia OS pour ${ctx.currentUser?.name ?? 'utilisateur'}.
${visible.length} projet(s) visible(s) par l'utilisateur :
${projectsList}
${stateSummary}

Réponds en français, factuellement, sans dire "je n'ai pas l'info" si la réponse est dans le contexte ci-dessus.

QUESTION UTILISATEUR:
`;
}

export async function handleFreetext(ctx: CommandContext): Promise<void> {
  const userPrompt = ctx.rawText.trim();
  if (!userPrompt) return;

  const contextPrefix = buildGalaxiaContext(ctx);
  const prompt = `${contextPrefix}${userPrompt}`;

  try {
    // Telegram freetext : même logique que le chat dashboard. taskType
    // 'creative-writing' matche la règle -> Claude Max (quality), bypass
    // interactive-guard parce que le user du bot EST Jeff lui-même. Si
    // Claude cramé, callLLM cascadera vers light (Groq).
    const result = await callLLM(
      {
        dataClass: 'personal',
        taskType: 'creative-writing',
        bypassInteractiveGuard: true,
      },
      prompt,
      ctx.config,
    );

    const text = result.text.length > MAX_REPLY_CHARS
      ? result.text.slice(0, MAX_REPLY_CHARS) + '\n…(tronqué)'
      : result.text;

    // Text from the LLM may contain arbitrary Markdown-breaking chars;
    // escape and send as MarkdownV2 with a thin header so the transport
    // used (cli vs http) is visible.
    const transport = result.decision.transport ? `/${result.decision.transport}` : '';
    const header = `_${escapeMd2(`${result.decision.provider}${transport} · ${result.decision.matchedRule}`)}_`;

    await ctx.client.sendMessage(ctx.chatId, `${header}\n\n${escapeMd2(text)}`, {
      parse_mode: 'MarkdownV2',
    });
  } catch (err) {
    const msg = (err as Error).message;
    // Quand tous les providers sont saturés (Max cramé + Groq 429 +
    // Claude credit low + Ollama down), on renvoie un message
    // actionnable au lieu de laisser Jeff penser que le bot est cassé.
    const friendly = /429|credit balance|exhausted|Too Many Requests/i.test(msg)
      ? `⚠️ Tous les LLM sont saturés là (rate limits / crédits). Ton message a été journalisé dans l'audit. Réessaye dans 5-10 min, ou ajoute du crédit Anthropic / upgrade Groq.`
      : `⚠️ LLM error: ${msg.slice(0, 400)}`;
    await ctx.client.sendMessage(
      ctx.chatId,
      escapeMd2(friendly),
      { parse_mode: 'MarkdownV2' },
    );
  }
}
