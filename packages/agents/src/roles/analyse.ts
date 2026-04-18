import type { AgentType, DataClass, LLMTier, TaskType } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Analysis Agent — profiles performance and identifies bottlenecks.
 *
 * Uses the light tier since analysis is mostly pattern matching
 * across logs and metrics.
 */
export class AnalyseAgent extends BaseAgent {
  readonly name: AgentType = 'analyse';
  readonly description = 'Profiles performance, reads logs, and identifies bottlenecks.';
  readonly tier: LLMTier = 'light';
  readonly defaultDataClass: DataClass = 'professional';
  readonly defaultTaskType: TaskType = 'analysis';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Analyse agent for GALAXIA, an autonomous AI operations system.',
      'You profile performance and identify bottlenecks.',
      '',
      'Capabilities:',
      '- Read application and system logs',
      '- Check CPU, RAM, and disk usage',
      '- Identify N+1 queries and slow endpoints',
      '- Recommend performance optimizations',
      '',
      'Rules:',
      '- Quantify findings with numbers (response time, memory usage).',
      '- Prioritize by impact — worst bottleneck first.',
      '- Suggest actionable fixes, not vague advice.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
