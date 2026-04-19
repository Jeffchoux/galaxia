// /watch <url ou texte libre> — Phase Watcher.
//
// Envoie la soumission au module Watcher. Si une URL est présente,
// Galaxia la fetch + extrait le texte, sinon le texte brut sert de body.
// Le LLM résume en 1 ligne, tagge, et détermine relevantProjects.
// Le finding est persisté dans memory/global-watch.jsonl.
//
// Owner-only — le feed watcher est une ressource instance-wide.

import { ingestWatcherSubmission, isOwner } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

export async function handleWatch(ctx: CommandContext): Promise<void> {
  if (!isOwner(ctx.currentUser)) {
    await ctx.client.sendMessage(ctx.chatId, escapeMd2('Commande inconnue. /help'), { parse_mode: 'MarkdownV2' });
    return;
  }
  const raw = ctx.args.join(' ').replace(/^["']|["']$/g, '').trim();
  if (!raw) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2('Usage: /watch <url ou texte libre à analyser>'),
      { parse_mode: 'MarkdownV2' });
    return;
  }

  await ctx.client.sendMessage(ctx.chatId,
    escapeMd2('⏳ Watcher analyse la soumission…'),
    { parse_mode: 'MarkdownV2' });

  try {
    const finding = await ingestWatcherSubmission(
      { rawText: raw, submittedBy: ctx.currentUser.name, source: 'user-telegram' },
      ctx.config,
    );
    if (!finding) {
      await ctx.client.sendMessage(ctx.chatId,
        escapeMd2('Watcher: rien d\'exploitable après analyse.'),
        { parse_mode: 'MarkdownV2' });
      return;
    }
    const tags = finding.tags.length > 0 ? finding.tags.map((t) => `#${t}`).join(' ') : '(aucun tag)';
    const rel = finding.relevantProjects.length > 0 ? finding.relevantProjects.join(', ') : '(aucun projet ciblé)';
    const lines = [
      '👁 *Finding ajouté au watcher*',
      '',
      `*${escapeMd2(finding.summary)}*`,
      `Tags : ${escapeMd2(tags)}`,
      `Projets pertinents : ${escapeMd2(rel)}`,
      finding.url ? `URL : ${escapeMd2(finding.url)}` : '',
    ].filter(Boolean);
    await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
  } catch (err) {
    await ctx.client.sendMessage(ctx.chatId,
      escapeMd2(`Erreur watcher: ${(err as Error).message}`),
      { parse_mode: 'MarkdownV2' });
  }
}
