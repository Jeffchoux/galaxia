import { spawnSync } from 'node:child_process';
import type { Pm2RestartAction, ActionResult } from '../types.js';

export async function execPm2Restart(action: Pm2RestartAction, dryRun: boolean): Promise<ActionResult> {
  if (dryRun) {
    return { kind: 'pm2-restart', success: true, dryRun, summary: `would pm2 restart ${action.process}`, durationMs: 0 };
  }
  const start = Date.now();
  const res = spawnSync('pm2', ['restart', action.process, '--update-env'], { encoding: 'utf-8', timeout: 30_000 });
  if (res.error) {
    return { kind: 'pm2-restart', success: false, dryRun, summary: `pm2 restart ${action.process} failed to spawn`, error: res.error.message, durationMs: Date.now() - start };
  }
  const ok = res.status === 0;
  return {
    kind: 'pm2-restart',
    success: ok,
    dryRun,
    summary: `pm2 restart ${action.process} exit=${res.status}`,
    output: [res.stdout, res.stderr].filter(Boolean).join('\n').slice(0, 2000),
    error: ok ? undefined : `exit ${res.status}`,
    durationMs: Date.now() - start,
  };
}
