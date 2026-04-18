// /status — daemon state snapshot. Mirrors the info the CLI's `galaxia
// status` prints, minus the flourishes. Reads the same state.json the
// daemon stamps on every cycle (packages/cli/src/cli.ts).

import { existsSync, readFileSync } from 'node:fs';
import { stateFilePath } from '@galaxia/core';
import type { CommandContext } from '../types.js';
import { escapeMd2, formatInTz, timeSince } from '../format.js';

function loadState(dataDir: string): Record<string, unknown> {
  const path = stateFilePath(dataDir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleStatus(ctx: CommandContext): Promise<void> {
  const state = loadState(ctx.config.dataDir);
  const daemon = (state.daemon as Record<string, unknown> | undefined) ?? {};
  const pid = daemon.pid as number | undefined;
  const startedAt = daemon.startedAt as string | undefined;
  const stoppedAt = daemon.stoppedAt as string | undefined;
  const lastCycle = daemon.lastCycle as string | undefined;
  const lastCycleMs = daemon.lastCycleMs as number | undefined;
  const cycleCount = (daemon.cycleCount as number | undefined) ?? 0;

  // The daemon is alive if we have a startedAt strictly more recent than
  // stoppedAt (or no stoppedAt at all). We don't cross-check process.kill
  // here because the bot may run in a child of the daemon itself.
  const running = !!startedAt && (!stoppedAt || new Date(startedAt).getTime() > new Date(stoppedAt).getTime());

  const lines: string[] = [];
  if (running) {
    lines.push('*Galaxia daemon: RUNNING*');
    if (pid) lines.push(`PID: \`${pid}\``);
    if (startedAt) lines.push(`Uptime: ${escapeMd2(timeSince(startedAt))} ${escapeMd2(`(since ${formatInTz(startedAt, ctx.tz)})`)}`);
  } else {
    lines.push('*Galaxia daemon: STOPPED*');
    if (stoppedAt) lines.push(`Arrêté: ${escapeMd2(timeSince(stoppedAt))}`);
  }
  lines.push(`Cycles exécutés: \`${cycleCount}\``);
  if (lastCycle) {
    const ms = typeof lastCycleMs === 'number' ? ` (${lastCycleMs}ms)` : '';
    lines.push(`Dernier cycle: ${escapeMd2(timeSince(lastCycle))}${escapeMd2(ms)}`);
  } else {
    lines.push(`Dernier cycle: ${escapeMd2('aucun')}`);
  }
  const sys = state.system as Record<string, unknown> | undefined;
  if (sys) {
    const cpu = String(sys.cpu ?? '?');
    const ram = String(sys.ram ?? '?');
    const disk = String(sys.disk ?? '?');
    lines.push(`Système: CPU \`${escapeMd2(cpu)}\` · RAM \`${escapeMd2(ram)}\` · Disk \`${escapeMd2(disk)}\``);
  }

  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
