// /discover — list GitHub repos of the authenticated user, emit one
// message per repo with an inline keyboard to create piece / archive /
// ignore. Owner-only (Phase 7 scope). When gh isn't authenticated we
// surface a friendly error.

import { discoverRepos, GhNotAuthenticatedError, isOwner } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';
import type { DiscoveryStore } from '../discovery.js';

export function makeDiscoverHandler(store: DiscoveryStore) {
  return async function handleDiscover(ctx: CommandContext): Promise<void> {
    if (!isOwner(ctx.currentUser)) {
      // Never acknowledge the command's existence to non-owners; answer
      // /help-like so the probe is indistinguishable from a typo.
      await ctx.client.sendMessage(ctx.chatId, escapeMd2('Commande inconnue. /help'), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    let result;
    try {
      result = await discoverRepos(ctx.config);
    } catch (err) {
      if (err instanceof GhNotAuthenticatedError) {
        await ctx.client.sendMessage(
          ctx.chatId,
          escapeMd2('gh CLI pas authentifié. Lance `gh auth login` sur le VPS puis relance /discover.'),
          { parse_mode: 'MarkdownV2' },
        );
        return;
      }
      await ctx.client.sendMessage(
        ctx.chatId,
        escapeMd2(`Discovery a échoué: ${(err as Error).message}`),
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    if (result.repos.length === 0) {
      await ctx.client.sendMessage(ctx.chatId, escapeMd2(`Aucun repo trouvé pour ${result.owner}.`), {
        parse_mode: 'MarkdownV2',
      });
      return;
    }

    // Header — one sync message that summarises what's coming. The repo
    // cards stream afterwards as one message each with its keyboard.
    const summary = countByStatus(result.repos);
    const headerLines = [
      `*GitHub Discovery — ${escapeMd2(result.owner)}*`,
      '',
      `Total repos: ${result.repos.length}`,
      `• Pièces actives: ${summary.piece}`,
      `• Pièces orphelines: ${summary.pieceOrphan}`,
      `• Dossiers non déclarés: ${summary.dirOnly}`,
      `• Disponibles: ${summary.available}`,
      `• Archivés: ${summary.archived}`,
      '',
      '_Un message par repo suit — boutons actifs 5 min\\._',
    ];
    await ctx.client.sendMessage(ctx.chatId, headerLines.join('\n'), { parse_mode: 'MarkdownV2' });

    // One card per repo. Archived repos get no keyboard (nothing to do).
    for (const repo of result.repos) {
      const icon = statusIcon(repo.status);
      const desc = repo.description ? `\n${escapeMd2(repo.description.slice(0, 200))}` : '';
      const updated = repo.updatedAt ? ` · updated ${escapeMd2(repo.updatedAt.slice(0, 10))}` : '';
      const title = `${icon} *${escapeMd2(repo.name)}* ${repo.isPrivate ? '🔒' : ''}${updated}${desc}`;

      if (repo.status === 'archived') {
        await ctx.client.sendMessage(ctx.chatId, `${title}\n_Déjà archivé — ignoré\\._`, {
          parse_mode: 'MarkdownV2',
        });
        continue;
      }

      const { token, keyboard } = store.create(ctx.chatId, repo.fullName, repo.description);
      const sent = await ctx.client.sendMessage(ctx.chatId, title, {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: keyboard },
      });
      store.setMessageId(token, sent.message_id);
    }
  };
}

function countByStatus(repos: Array<{ status: string }>) {
  return {
    piece: repos.filter((r) => r.status === 'piece').length,
    pieceOrphan: repos.filter((r) => r.status === 'piece-orphan').length,
    dirOnly: repos.filter((r) => r.status === 'dir-only').length,
    available: repos.filter((r) => r.status === 'available').length,
    archived: repos.filter((r) => r.status === 'archived').length,
  };
}

function statusIcon(status: string): string {
  switch (status) {
    case 'piece':        return '🏠';
    case 'piece-orphan': return '🏚';
    case 'dir-only':     return '📁';
    case 'archived':     return '🗄';
    default:             return '🆕';
  }
}
