// GALAXIA Action Runner — public surface.

export type {
  ActionKind,
  Action,
  ActionPlan,
  ActionResult,
  RunnerMode,
  EditFileAction,
  ReadFileAction,
  RunShellAction,
  Pm2RestartAction,
  Pm2StatusAction,
  RunTestsAction,
  GitCommitAction,
  HttpGetAction,
  ProjectActionPermissions,
  ActionRunnerConfig,
} from './types.js';
export { DEFAULT_ACTION_RUNNER_CONFIG } from './types.js';

export { validateAction, validatePlan, OK } from './permissions.js';
export type { PermissionCheck } from './permissions.js';

export { shellIsAllowed, domainIsAllowed, pathIsUnder, urlHost, normalizeShell } from './allowlist.js';

export { execute, executeAction, renderPlanLine } from './runner.js';
export type { ExecuteOptions } from './runner.js';
