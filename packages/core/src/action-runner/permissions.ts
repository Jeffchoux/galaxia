// GALAXIA Action Runner — per-action permission checks.
//
// Every Action runs through validateAction() before any handler touches
// the system. The function never throws — it returns a structured
// { ok, reason } so callers can log / surface the refusal.

import { resolve, isAbsolute } from 'node:path';
import type { GalaxiaConfig, Project } from '../types.js';
import type { Action } from './types.js';
import { shellIsAllowed, domainIsAllowed, pathIsUnder } from './allowlist.js';

export interface PermissionCheck {
  ok: boolean;
  reason?: string;
}

export const OK: PermissionCheck = { ok: true };
const DENY = (reason: string): PermissionCheck => ({ ok: false, reason });

/**
 * Check a single action against the project's permission profile.
 *
 * `project` is the Project entry from galaxia.yml — callers look it up
 * from `config.projects` before calling. We pass it explicitly (rather
 * than letting validateAction search) so the caller's scope check
 * happens first: a Milan-style collaborator should never be able to
 * even pass a project she doesn't own to validateAction.
 */
export function validateAction(
  action: Action,
  project: Project,
  config: GalaxiaConfig,
): PermissionCheck {
  void config; // reserved for future cross-project rules

  switch (action.kind) {
    case 'read-file':
    case 'edit-file': {
      if (!isAbsolute(action.path)) return DENY(`${action.kind}: path must be absolute`);
      const normalized = resolve(action.path);
      if (!pathIsUnder(normalized, project.path)) {
        return DENY(`${action.kind}: "${action.path}" is outside project "${project.name}" (${project.path})`);
      }
      return OK;
    }

    case 'run-shell': {
      if (!shellIsAllowed(action.command, project.allowedShellCommands)) {
        return DENY(`run-shell: "${action.command}" is not in allowedShellCommands for "${project.name}"`);
      }
      if (action.cwd) {
        const cwd = resolve(action.cwd);
        if (!pathIsUnder(cwd, project.path)) {
          return DENY(`run-shell: cwd "${action.cwd}" must be inside project path`);
        }
      }
      return OK;
    }

    case 'http-get': {
      if (!domainIsAllowed(action.url, project.allowedHttpDomains)) {
        return DENY(`http-get: "${action.url}" host is not in allowedHttpDomains for "${project.name}"`);
      }
      return OK;
    }

    case 'pm2-restart':
    case 'pm2-status': {
      if (action.kind === 'pm2-restart' && !action.process) {
        return DENY('pm2-restart: process name required');
      }
      const targetProcess = action.kind === 'pm2-restart' ? action.process : action.process;
      if (targetProcess && project.pm2Allowed && !project.pm2Allowed.includes(targetProcess)) {
        return DENY(`${action.kind}: process "${targetProcess}" not in pm2Allowed for "${project.name}"`);
      }
      return OK;
    }

    case 'run-tests': {
      // run-tests is implicit: the project must declare at least one
      // allowedShellCommand that starts with "npm test", "pnpm test",
      // "vitest", "jest", or equivalent. Otherwise the project has no
      // opinion on testing and we refuse.
      const cmds = project.allowedShellCommands ?? [];
      const ok = cmds.some((c) => /(^|\s)(npm|pnpm|yarn|vitest|jest|pytest)(\s+(test|run))?/.test(c.trim()));
      if (!ok) return DENY(`run-tests: no test-capable command in allowedShellCommands for "${project.name}"`);
      return OK;
    }

    case 'git-commit': {
      // git-commit is always local. git push is forbidden at the type
      // level (no field for remote) and at the handler level (we never
      // shell out to `git push`). Still, refuse messages that contain
      // "push" + "origin" as a belt-and-suspenders heuristic.
      if (/git\s+push/i.test(action.message)) {
        return DENY('git-commit: commit message must not contain "git push" — push is forbidden in v1');
      }
      if (action.paths) {
        for (const p of action.paths) {
          const abs = isAbsolute(p) ? p : resolve(project.path, p);
          if (!pathIsUnder(abs, project.path)) {
            return DENY(`git-commit: path "${p}" is outside project "${project.name}"`);
          }
        }
      }
      return OK;
    }
  }
}

/**
 * Convenience: validate a whole plan. Short-circuits on the first refusal
 * so the caller sees the failing action. Use this for /plan dry-run UX.
 */
export function validatePlan(
  plan: Action[],
  project: Project,
  config: GalaxiaConfig,
): { ok: boolean; failures: Array<{ index: number; action: Action; reason: string }> } {
  const failures: Array<{ index: number; action: Action; reason: string }> = [];
  for (let i = 0; i < plan.length; i++) {
    const r = validateAction(plan[i]!, project, config);
    if (!r.ok) failures.push({ index: i, action: plan[i]!, reason: r.reason ?? 'denied' });
  }
  return { ok: failures.length === 0, failures };
}
