// GALAXIA Core — public API

export type {
  LLMTier,
  LLMProvider,
  AgentType,
  Severity,
  ProjectStatus,
  MissionStatus,
  GalaxiaConfig,
  GalaxiaUser,
  GalaxiaUserRole,
  Project,
  LLMProviderConfig,
  AgentAction,
  TriageResult,
  Mission,
  KnowledgeEntry,
  SystemMetrics,
  ProjectState,
  GalaxiaState,
  ProjectCycleResult,
  CycleReport,
} from './types.js';

export { loadConfig, getDefaultConfig, loadEnvFiles } from './config.js';
export { callLLM } from './llm-router.js';
export { callLLMByTier } from './llm-router.js';
export { loadState, updateState, saveState, getDefaultState } from './state.js';
export { loadKnowledge, addKnowledge, searchKnowledge } from './knowledge.js';
export { collectMetrics, runCycle } from './orchestrator.js';
export { sendTelegram, sendDiscord, notify } from './notifications.js';
export {
  resolveDataDir,
  stateDir,
  stateFilePath,
  logsDir,
  logFilePath,
  routingAuditPath,
  knowledgeDir,
  knowledgeFilePath,
  missionsFilePath,
  pidFilePath,
  configDir,
  configSearchPaths,
} from './paths.js';

// Routing (Pilier 4.bis)
export type {
  BuiltInDataClass,
  DataClass,
  BuiltInTaskType,
  TaskType,
  RoutingLocation,
  RoutingContext,
  TimeWindow,
  RoutingRuleWhen,
  RoutingRuleThen,
  RoutingRule,
  RoutingDecision,
  RoutingAuditEntry,
  RoutingConfig,
  AuditQuery,
  ValidationReport,
} from './routing/index.js';
export {
  DEFAULT_RULES,
  DEFAULT_FALLBACK_TIER,
  decide,
  ruleMatches,
  logRouting,
  queryAudit,
  validateRules,
} from './routing/index.js';

// General Manager (Phase 10)
export type {
  GMConfig,
  GMObjective,
  GMState,
  GMAction,
  GMDecision,
  ProjectGMOptions,
  GMLoopHandle,
} from './gm/index.js';
export {
  defaultGMState,
  GM_DEFAULT_INTERVAL_MIN,
  GM_MIN_INTERVAL_MIN,
  GM_RECENT_ACTIONS_CAP,
  ProjectGM,
  runGMLoop,
  gmDir,
  gmStatePath,
  gmJournalPath,
  loadGMState,
  saveGMState,
  appendJournal,
  tailJournal,
  decideNext,
  parseGMDecision,
} from './gm/index.js';

// Action Runner (Phase 9)
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
  PermissionCheck,
  ExecuteOptions,
} from './action-runner/index.js';
export {
  DEFAULT_ACTION_RUNNER_CONFIG,
  validateAction,
  validatePlan,
  execute,
  executeAction,
  renderPlanLine,
  shellIsAllowed,
  domainIsAllowed,
  pathIsUnder,
  urlHost,
  normalizeShell,
} from './action-runner/index.js';

// GitHub Discovery (Phase 8.5)
export {
  discoverRepos,
  createRoom,
  archiveRepo,
  GhNotAuthenticatedError,
} from './github/index.js';
export type {
  GhRepo,
  DiscoveredRepo,
  DiscoverResult,
  RepoPieceStatus,
  CreateRoomOptions,
  CreateRoomResult,
} from './github/index.js';

// Auth (Phase 7 — multi-user with scope)
export {
  userCanAccess,
  findUserByTelegramChatId,
  authenticateUser,
  authenticateByPassword,
  hashPassword,
  verifyPassword,
  requireScope,
  requireOwner,
  isOwner,
  ScopeError,
  OwnerOnlyError,
} from './auth/index.js';
