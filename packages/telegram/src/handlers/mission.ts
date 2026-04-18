// /mission add "<description>" — append a mission to missions.json.
// /mission delete <id>          — remove a mission (gated by confirmation).
//
// Storage format mirrors the CLI's cmdMissionAdd (packages/cli/src/cli.ts):
// simple JSON array of { id, description, status, createdAt }.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { missionsFilePath } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';
import { ConfirmationStore, requestConfirmation } from '../confirmation.js';

interface StoredMission {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

function readMissions(dataDir: string): StoredMission[] {
  const path = missionsFilePath(dataDir);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as StoredMission[];
  } catch {
    return [];
  }
}

function writeMissions(dataDir: string, missions: StoredMission[]): void {
  const path = missionsFilePath(dataDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(missions, null, 2), 'utf-8');
}

export function makeMissionHandler(store: ConfirmationStore) {
  return async function handleMission(ctx: CommandContext): Promise<void> {
    const sub = ctx.args[0];
    if (sub !== 'add' && sub !== 'delete') {
      await ctx.client.sendMessage(
        ctx.chatId,
        escapeMd2('Usage: /mission add "<desc>"  |  /mission delete <id>'),
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    if (sub === 'add') {
      const desc = ctx.args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
      if (!desc) {
        await ctx.client.sendMessage(ctx.chatId, escapeMd2('Description manquante.'), { parse_mode: 'MarkdownV2' });
        return;
      }
      const missions = readMissions(ctx.config.dataDir);
      const mission: StoredMission = {
        id: `m-${Date.now().toString(36)}`,
        description: desc,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      missions.push(mission);
      writeMissions(ctx.config.dataDir, missions);
      await ctx.client.sendMessage(
        ctx.chatId,
        `✅ Mission ajoutée\n\`${escapeMd2(mission.id)}\` — ${escapeMd2(desc)}`,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    // delete
    const id = ctx.args[1];
    if (!id) {
      await ctx.client.sendMessage(ctx.chatId, escapeMd2('Usage: /mission delete <id>'), { parse_mode: 'MarkdownV2' });
      return;
    }
    const missions = readMissions(ctx.config.dataDir);
    const found = missions.find((m) => m.id === id);
    if (!found) {
      await ctx.client.sendMessage(ctx.chatId, escapeMd2(`Mission "${id}" introuvable.`), { parse_mode: 'MarkdownV2' });
      return;
    }

    const action = 'mission-delete';
    const headline = `🗑 *Suppression de mission* \`${escapeMd2(id)}\`\n${escapeMd2(found.description)}`;
    const run = async (): Promise<void> => {
      const current = readMissions(ctx.config.dataDir);
      const next = current.filter((m) => m.id !== id);
      writeMissions(ctx.config.dataDir, next);
      await ctx.client.sendMessage(ctx.chatId, `✅ Mission supprimée: \`${escapeMd2(id)}\``, {
        parse_mode: 'MarkdownV2',
      });
    };

    if (store.isGated(action, ctx.config)) {
      await requestConfirmation(store, ctx, action, headline, { id }, async () => { await run(); });
    } else {
      await run();
    }
  };
}
