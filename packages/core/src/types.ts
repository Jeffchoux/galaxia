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
}

export interface Project {
  name: string;
  path: string;
  pm2Name?: string;
  port?: number;
  description?: string;
}

export interface GalaxiaConfig {
  business: {
    name: string;
    description: string;
  };
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
