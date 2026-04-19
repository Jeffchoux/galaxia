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
