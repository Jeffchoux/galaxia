// GALAXIA Action Runner — central execute() entrypoint.
//
// Phase 9 surface v1: dry-run by default, apply on explicit opt-in.
// Every action goes through validateAction() first; refused actions
// produce an ActionResult with success=false and a reason. Handlers
// only run when the permission check succeeds.

import type { GalaxiaConfig, Project } from '../types.js';
import type { Action, ActionPlan, ActionResult, RunnerMode } from './types.js';
import { validateAction } from './permissions.js';
import { execEditFile } from './handlers/edit-file.js';
import { execReadFile } from './handlers/read-file.js';
import { execRunShell } from './handlers/run-shell.js';
import { execPm2Restart } from './handlers/pm2-restart.js';
import { execPm2Status } from './handlers/pm2-status.js';
import { execRunTests } from './handlers/run-tests.js';
import { execGitCommit } from './handlers/git-commit.js';
import { execHttpGet } from './handlers/http-get.js';

export interface ExecuteOptions {
  mode: RunnerMode;
  /** Stop on the first refusal / failure. Default false: we try every
   * action and return a full report. */
  stopOnError?: boolean;
}

export async function executeAction(
  action: Action,
  project: Project,
  config: GalaxiaConfig,
  mode: RunnerMode,
): Promise<ActionResult> {
  const check = validateAction(action, project, config);
  if (!check.ok) {
    return {
      kind: action.kind,
      success: false,
      dryRun: mode === 'dry-run',
      summary: `refused: ${check.reason}`,
      error: check.reason,
      durationMs: 0,
    };
  }
  const dry = mode === 'dry-run';
  switch (action.kind) {
    case 'edit-file':   return execEditFile(action, dry);
    case 'read-file':   return execReadFile(action, dry);
    case 'run-shell':   return execRunShell(action, project.path, dry);
    case 'pm2-restart': return execPm2Restart(action, dry);
    case 'pm2-status':  return execPm2Status(action, dry);
    case 'run-tests':   return execRunTests(action, project, dry);
    case 'git-commit':  return execGitCommit(action, project.path, dry);
    case 'http-get':    return execHttpGet(action, dry);
  }
}

export async function execute(
  plan: ActionPlan,
  project: Project,
  config: GalaxiaConfig,
  options: ExecuteOptions,
): Promise<ActionResult[]> {
  const out: ActionResult[] = [];
  for (const action of plan) {
    const res = await executeAction(action, project, config, options.mode);
    out.push(res);
    if (!res.success && options.stopOnError) break;
  }
  return out;
}

/** Short human-readable plan summary for Telegram rendering. */
export function renderPlanLine(action: Action): string {
  switch (action.kind) {
    case 'edit-file':   return `📝 edit-file ${action.path} (${action.mode ?? 'overwrite'})`;
    case 'read-file':   return `👀 read-file ${action.path}`;
    case 'run-shell':   return `🖥 run-shell \`${action.command}\``;
    case 'pm2-restart': return `♻️ pm2-restart ${action.process}`;
    case 'pm2-status':  return `📊 pm2-status ${action.process ?? '(all)'}`;
    case 'run-tests':   return `🧪 run-tests ${action.filter ?? ''}`.trim();
    case 'git-commit':  return `💾 git-commit "${action.message.slice(0, 60)}"`;
    case 'http-get':    return `🌐 http-get ${action.url}`;
  }
}
