// GALAXIA Action Runner — Phase 9 types.
//
// Surface v1 approved by Jeff: 8 action kinds. Everything else is refused.
// Actions are a discriminated union so handlers get fully typed payloads.

export type ActionKind =
  | 'edit-file'
  | 'read-file'
  | 'run-shell'
  | 'pm2-restart'
  | 'pm2-status'
  | 'run-tests'
  | 'git-commit'
  | 'http-get';

export interface BaseAction {
  // Always present — identifies the Action shape.
  kind: ActionKind;
  // Human-readable rationale, surfaced in /plan output and audit logs.
  reason?: string;
}

export interface EditFileAction extends BaseAction {
  kind: 'edit-file';
  path: string;              // absolute; must start with one of config.projects[].path + safe zones
  contents: string;          // full file contents (or patch when patch:true)
  mode?: 'overwrite' | 'create' | 'append';
}

export interface ReadFileAction extends BaseAction {
  kind: 'read-file';
  path: string;
  maxBytes?: number;         // default 64 KiB
}

export interface RunShellAction extends BaseAction {
  kind: 'run-shell';
  command: string;           // must match an allowedShellCommands[] entry
  cwd?: string;              // default: project.path
  timeoutMs?: number;        // default 60_000
}

export interface Pm2RestartAction extends BaseAction {
  kind: 'pm2-restart';
  process: string;           // PM2 process name; must be in project.pm2Allowed[]
}

export interface Pm2StatusAction extends BaseAction {
  kind: 'pm2-status';
  process?: string;          // omit = status of everything the scope covers
}

export interface RunTestsAction extends BaseAction {
  kind: 'run-tests';
  filter?: string;           // optional test name filter (passed to the test runner)
}

export interface GitCommitAction extends BaseAction {
  kind: 'git-commit';
  message: string;
  paths?: string[];          // if omitted: git add -A within project.path only
  // Push-related fields are INTENTIONALLY ABSENT. git-push is forbidden
  // at the type level so a malformed LLM response can't produce one.
}

export interface HttpGetAction extends BaseAction {
  kind: 'http-get';
  url: string;               // must parse to a URL whose host matches allowedHttpDomains
  headers?: Record<string, string>;
  maxBytes?: number;         // default 256 KiB
}

export type Action =
  | EditFileAction
  | ReadFileAction
  | RunShellAction
  | Pm2RestartAction
  | Pm2StatusAction
  | RunTestsAction
  | GitCommitAction
  | HttpGetAction;

export type ActionPlan = Action[];

// ── Results ────────────────────────────────────────────────────────────────

export interface ActionResult {
  kind: ActionKind;
  success: boolean;
  /** Short summary — one line, for /plan rendering. */
  summary: string;
  /** Stdout / body / file contents (truncated to maxBytes for safety). */
  output?: string;
  /** Human-readable error when success=false. */
  error?: string;
  /** Duration of the apply step in ms. Always 0 for dry-run. */
  durationMs: number;
  /** True when the action was validated but not applied (dry-run mode). */
  dryRun: boolean;
}

export type RunnerMode = 'dry-run' | 'apply';

// ── Permission shape attached to each Project in GalaxiaConfig ─────────────
// (The actual additions to Project/GalaxiaConfig live in ../types.ts; this
// block documents the intent.)

export interface ProjectActionPermissions {
  /** Exact commands the agent may run via run-shell. Prefix match on a
   * trimmed, single-space-collapsed form. Entries SHOULD be single executions
   * like "npm test" or "pnpm -w build" rather than whole shell pipelines. */
  allowedShellCommands?: string[];
  /** Fully qualified domain names the agent may contact via http-get.
   * Matched case-insensitively against URL hostnames; wildcards are NOT
   * supported (explicit list = easier to audit). */
  allowedHttpDomains?: string[];
  /** PM2 process names the agent may restart / inspect. */
  pm2Allowed?: string[];
}

export interface ActionRunnerConfig {
  defaultMode: RunnerMode;
  /** Kinds that always require an extra confirmation step before apply. */
  requireConfirmation: ActionKind[];
}

export const DEFAULT_ACTION_RUNNER_CONFIG: ActionRunnerConfig = {
  defaultMode: 'dry-run',
  requireConfirmation: ['edit-file', 'run-shell', 'pm2-restart', 'git-commit'],
};
