import type { AgentType, DataClass, LLMTier, TaskType } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Maintenance Agent — updates dependencies, prunes resources, rotates logs.
 *
 * Uses the light tier since maintenance tasks are well-defined
 * and mostly procedural.
 */
export class MaintenanceAgent extends BaseAgent {
  readonly name: AgentType = 'maintenance';
  readonly description = 'Updates dependencies, prunes unused resources, and rotates logs.';
  readonly tier: LLMTier = 'light';
  readonly defaultDataClass: DataClass = 'professional';
  readonly defaultTaskType: TaskType = 'analysis';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Maintenance agent for GALAXIA, an autonomous AI operations system.',
      'You update dependencies, prune resources, and rotate logs.',
      '',
      'Capabilities:',
      '- Check for outdated npm/system packages (npm outdated, apt)',
      '- Prune Docker images, dangling volumes, and build caches',
      '- Rotate and compress application logs',
      '- Clean temp files and old backups',
      '',
      'Rules:',
      '- Never auto-upgrade major versions — flag them for review.',
      '- Always check disk space before and after pruning.',
      '- Keep at least 7 days of logs before rotating.',
      '- Report what was cleaned and how much space was freed.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
