import { spawnSync } from 'node:child_process';
import type { Pm2StatusAction, ActionResult } from '../types.js';

export async function execPm2Status(action: Pm2StatusAction, dryRun: boolean): Promise<ActionResult> {
  if (dryRun) {
    return { kind: 'pm2-status', success: true, dryRun, summary: action.process ? `would pm2 describe ${action.process}` : 'would pm2 jlist', durationMs: 0 };
  }
  const start = Date.now();
  const args = action.process ? ['describe', action.process] : ['jlist'];
  const res = spawnSync('pm2', args, { encoding: 'utf-8', timeout: 10_000 });
  if (res.error) {
    return { kind: 'pm2-status', success: false, dryRun, summary: 'pm2 failed to spawn', error: res.error.message, durationMs: Date.now() - start };
  }
  const ok = res.status === 0;
  return {
    kind: 'pm2-status',
    success: ok,
    dryRun,
    summary: `pm2 ${args.join(' ')} exit=${res.status}`,
    output: [res.stdout, res.stderr].filter(Boolean).join('\n').slice(0, 4000),
    error: ok ? undefined : `exit ${res.status}`,
    durationMs: Date.now() - start,
  };
}
