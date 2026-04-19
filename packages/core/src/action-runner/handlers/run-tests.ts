import { spawnSync } from 'node:child_process';
import type { RunTestsAction, ActionResult } from '../types.js';
import type { Project } from '../../types.js';

/**
 * Pick the first test-capable command out of the project's allowlist. We
 * don't hard-code "npm test" — the project declares what "tests" means.
 */
function pickTestCommand(project: Project): string | null {
  for (const cmd of project.allowedShellCommands ?? []) {
    if (/(^|\s)(npm|pnpm|yarn)\s+(test|run\s+test)/.test(cmd)) return cmd;
    if (/(^|\s)(vitest|jest|pytest)(\s|$)/.test(cmd)) return cmd;
  }
  return null;
}

export async function execRunTests(action: RunTestsAction, project: Project, dryRun: boolean): Promise<ActionResult> {
  const cmd = pickTestCommand(project);
  if (!cmd) {
    return { kind: 'run-tests', success: false, dryRun, summary: `no test command in allowedShellCommands for ${project.name}`, error: 'no test command', durationMs: 0 };
  }
  const full = action.filter ? `${cmd} ${action.filter}` : cmd;
  if (dryRun) {
    return { kind: 'run-tests', success: true, dryRun, summary: `would run \`${full}\` in ${project.path}`, durationMs: 0 };
  }
  const start = Date.now();
  const parts = full.trim().split(/\s+/);
  const res = spawnSync(parts[0]!, parts.slice(1), { cwd: project.path, encoding: 'utf-8', timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
  if (res.error) {
    return { kind: 'run-tests', success: false, dryRun, summary: 'test runner failed to spawn', error: res.error.message, durationMs: Date.now() - start };
  }
  const ok = res.status === 0;
  return {
    kind: 'run-tests',
    success: ok,
    dryRun,
    summary: `${full} exit=${res.status}`,
    output: [res.stdout, res.stderr].filter(Boolean).join('\n').slice(0, 6000),
    error: ok ? undefined : `exit ${res.status}`,
    durationMs: Date.now() - start,
  };
}
