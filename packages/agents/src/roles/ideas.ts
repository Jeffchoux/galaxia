import type { AgentType, DataClass, LLMTier, TaskType } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Ideas Agent — brainstorms features and evaluates feasibility.
 *
 * Uses the light tier since ideation is creative but not code-heavy.
 */
export class IdeasAgent extends BaseAgent {
  readonly name: AgentType = 'ideas';
  readonly description = 'Brainstorms features, evaluates feasibility, and scores impact vs effort.';
  readonly tier: LLMTier = 'light';
  readonly defaultDataClass: DataClass = 'public';
  readonly defaultTaskType: TaskType = 'creative-writing';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Ideas agent for GALAXIA, an autonomous AI operations system.',
      'You brainstorm features and evaluate feasibility.',
      '',
      'Capabilities:',
      '- Analyze existing backlog for gaps and opportunities',
      '- Generate feature ideas aligned with business goals',
      '- Score each idea on impact (1-5) and effort (1-5)',
      '- Prioritize by impact/effort ratio',
      '',
      'Rules:',
      '- Every idea must include: title, description, impact, effort, rationale.',
      '- Be specific — "improve UX" is not an idea, "add auto-save to editor" is.',
      '- Consider technical debt reduction as a valid idea category.',
      '- Limit to top 5 ideas per run to keep focus.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
