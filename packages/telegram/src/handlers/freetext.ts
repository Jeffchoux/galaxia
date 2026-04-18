// <free text> — any incoming message that isn't a /command. Routes
// through callLLM with dataClass='personal', taskType='analysis'. Per the
// manifesto (§ 3.bis) and Q1 of the phase 6 brief, this audit-traces
// automatically because callLLM writes to routing-audit.jsonl.

import { callLLM } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

// Hard cap so a runaway LLM response can't exceed Telegram's 4096-char
// limit. Messages longer than this are truncated with an ellipsis.
const MAX_REPLY_CHARS = 3800;

export async function handleFreetext(ctx: CommandContext): Promise<void> {
  const prompt = ctx.rawText.trim();
  if (!prompt) return;

  try {
    const result = await callLLM(
      {
        dataClass: 'personal',
        taskType: 'analysis',
        // No projectTag here — the conversation isn't scoped to a project.
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
    await ctx.client.sendMessage(
      ctx.chatId,
      escapeMd2(`LLM error: ${(err as Error).message}`),
      { parse_mode: 'MarkdownV2' },
    );
  }
}
