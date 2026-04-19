import { spawnSync } from 'node:child_process';
import type { RunShellAction, ActionResult } from '../types.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export async function execRunShell(action: RunShellAction, projectPath: string, dryRun: boolean): Promise<ActionResult> {
  const cwd = action.cwd ?? projectPath;
  const timeout = action.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (dryRun) {
    return { kind: 'run-shell', success: true, dryRun, summary: `would run \`${action.command}\` in ${cwd} (t/o ${timeout}ms)`, durationMs: 0 };
  }
  const start = Date.now();
  // Split into argv for spawnSync instead of invoking a shell — no
  // interpolation, no globbing, no pipe expansion. If an allowlisted
  // command needs shell features, the operator should wrap it in a
  // script inside the project.
  const parts = action.command.trim().split(/\s+/);
  const bin = parts[0]!;
  const args = parts.slice(1);
  const res = spawnSync(bin, args, { cwd, timeout, encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024 });
  const dur = Date.now() - start;
  if (res.error) {
    return { kind: 'run-shell', success: false, dryRun, summary: `${action.command} failed to spawn`, error: res.error.message, durationMs: dur };
  }
  const ok = res.status === 0;
  const output = [res.stdout, res.stderr].filter(Boolean).join('\n').slice(0, 4000);
  return {
    kind: 'run-shell',
    success: ok,
    dryRun,
    summary: `${action.command} exit=${res.status} (${dur}ms)`,
    output,
    error: ok ? undefined : `exit ${res.status}`,
    durationMs: dur,
  };
}
