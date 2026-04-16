import type { AgentType } from '@galaxia/core';

export type LLMTier = 'light' | 'medium' | 'heavy' | 'local';

export interface AgentDefinition {
  name: string;
  description: string;
  tier: LLMTier;
  systemPrompt: string;
}

export interface PluginHooks {
  onCycleStart?: (ctx: PluginContext) => void | Promise<void>;
  onCycleEnd?: (ctx: PluginContext) => void | Promise<void>;
  onFix?: (ctx: PluginContext) => void | Promise<void>;
  onAlert?: (ctx: PluginContext) => void | Promise<void>;
}

export interface LLMProviderPlugin {
  name: string;
  call(prompt: string): Promise<string>;
}

export interface DashboardWidget {
  name: string;
  component: string;
}

export interface PluginContext {
  dataDir: string;
  config: Record<string, unknown>;
}

export interface GalaxiaPlugin {
  name: string;
  version: string;
  agents?: AgentDefinition[];
  hooks?: PluginHooks;
  llmProviders?: LLMProviderPlugin[];
  dashboardWidgets?: DashboardWidget[];
}

const plugins: GalaxiaPlugin[] = [];

export function registerPlugin(plugin: GalaxiaPlugin): void {
  plugins.push(plugin);
  console.log(`[galaxia] Plugin registered: ${plugin.name} v${plugin.version}`);
}

export function getPlugins(): GalaxiaPlugin[] {
  return [...plugins];
}
