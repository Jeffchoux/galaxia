// GALAXIA Core Types

export type LLMTier = 'light' | 'medium' | 'heavy' | 'local';
export type LLMProvider = 'groq' | 'ollama' | 'claude' | 'openai';
export type AgentType = 'dev' | 'cicd' | 'test' | 'analyse' | 'controle' | 'veille' | 'ideas' | 'contenu' | 'review' | 'maintenance';
export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ProjectStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type MissionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface LLMProviderConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  url?: string;
  // Claude-only: pick the transport. 'cli' tries the local `claude` binary
  // first (exploits a Claude Max subscription), then falls back to HTTP.
  // 'http' skips the CLI entirely. Default when unset: 'cli'.
  transport?: 'cli' | 'http';
  // Claude CLI timeout in ms. Default 60_000. Ignored for HTTP.
  timeoutMs?: number;
}

export interface Project {
  name: string;
  path: string;
  pm2Name?: string;
  port?: number;
  description?: string;
  // Phase 9 — per-project action runner permissions. Empty / missing =
  // the agent can't do anything dynamic in this project. See
  // packages/core/src/action-runner/types.ts for the rules.
  allowedShellCommands?: string[];
  allowedHttpDomains?: string[];
  pm2Allowed?: string[];
  // Phase 10 — per-project General Manager config. When `gm.enabled`,
  // the daemon starts a review loop for this project. See
  // packages/core/src/gm/types.ts.
  gm?: import('./gm/types.js').GMConfig;
}

// Multi-user support — introduced in Phase 7. Each entry describes one
// human (owner or collaborator) and how they authenticate, plus the scope
// of projects they are allowed to see/act on. `scope: ['*']` grants access
// to every project (used by the owner). A user with scope `[]` is a
// "registered but inactive" user — useful when we know someone will join
// later but their project isn't ready yet (e.g. Milan before learn-ai is
// migrated).
export type GalaxiaUserRole = 'owner' | 'collaborator';

export interface GalaxiaUser {
  name: string;
  role: GalaxiaUserRole;
  scope: string[];
  auth: {
    telegramChatIds?: (number | string)[];
    // scrypt hash in the format `scrypt$<salt-hex>$<hash-hex>`. Verified
    // by auth/auth.ts → verifyPassword(). Optional: a Telegram-only user
    // can leave this unset.
    webPasswordHash?: string;
  };
}

export interface GalaxiaConfig {
  business: {
    name: string;
    description: string;
  };
  // Multi-user (Phase 7). Optional for back-compat — when absent, the
  // legacy `telegram.allowedChatIds` path still works as a single-owner
  // shortcut.
  owner?: string;
  users?: GalaxiaUser[];
  // Phase 9 — action runner configuration (dry-run default, gated kinds).
  actionRunner?: import('./action-runner/types.js').ActionRunnerConfig;
  llm: {
    light: LLMProviderConfig;
    medium: LLMProviderConfig;
    heavy: LLMProviderConfig;
    local: LLMProviderConfig;
  };
  agents: {
    mode: 'mission' | 'continuous';
    cycleInterval: number; // seconds
    enabled: AgentType[];
  };
  notifications: {
    telegram?: {
      botToken: string;
      chatId: string;
    };
    discord?: {
      webhookUrl: string;
    };
  };
  projects: Project[];
  dataDir: string;
  // Routing doctrine — Pilier 4.bis. Declared here as `unknown` shape in the
  // Core's type to avoid a circular import with ./routing; the real shape
  // lives in ./routing/types.ts (RoutingConfig). Consumers that need typed
  // access import it directly from '@galaxia/core' (re-exported below).
  routing?: import('./routing/types.js').RoutingConfig;
  // Pilier 3 — bidirectional Telegram control channel. Consumed by
  // @galaxia/telegram (startTelegramBot). `notifications.telegram` above
  // stays in place for one-way emit from the Core; this is the reception
  // side with auth whitelist and confirmation flow.
  telegram?: {
    enabled: boolean;
    botToken: string;                        // from .env via ${TELEGRAM_BOT_TOKEN}
    allowedChatIds: (number | string)[];     // auth whitelist — silent refuse outside this set
    pollingIntervalMs?: number;              // long-poll timeout, default 30_000
    requiresConfirmation?: string[];         // action IDs that need inline-keyboard approval
  };
  // Presentation — affects only user-facing strings (Telegram replies, CLI
  // displays). Internal logs (orchestrator.log, routing-audit.jsonl) stay
  // UTC ISO-8601 for reproducibility.
  display?: {
    timezone?: string;                       // IANA TZ, e.g. 'Indian/Reunion'. Default 'UTC'.
  };
}

export interface AgentAction {
  type: AgentType;
  task: string;
  priority: 1 | 2 | 3 | 4 | 5;
}

export interface TriageResult {
  needsAction: boolean;
  severity: Severity;
  actions: AgentAction[];
  summary: string;
  backlogAdditions: string[];
}

export interface Mission {
  id: string;
  name: string;
  description: string;
  status: MissionStatus;
  successCriteria: string[];
  assignedAgents: AgentType[];
  createdAt: string;
  completedAt?: string;
}

export interface KnowledgeEntry {
  date: string;
  category: string;
  content: string;
  project?: string;
}

export interface SystemMetrics {
  cpu: string;
  ram: string;
  disk: string;
  pm2Online: string;
}

export interface ProjectState {
  status: ProjectStatus;
  lastCycle: string;
  backlogCount: number;
  bugFixedToday: number;
  nextPriority: string;
}

export interface GalaxiaState {
  system: SystemMetrics;
  projects: Record<string, ProjectState>;
  lastUpdated: string;
  dailyStats: {
    bugsFixed: number;
    featuresShipped: number;
  };
}

export interface ProjectCycleResult {
  project: string;
  triage: TriageResult;
  actionsDispatched: number;
  duration: number; // ms
}

export interface CycleReport {
  timestamp: string;
  projects: ProjectCycleResult[];
  systemMetrics: SystemMetrics;
  duration: number; // ms
}
