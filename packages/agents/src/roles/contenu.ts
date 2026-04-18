import type { AgentType, DataClass, LLMTier, TaskType } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Content Agent — audits UX copy, SEO metadata, and marketing content.
 *
 * Uses the light tier since content review is mostly text analysis.
 */
export class ContenuAgent extends BaseAgent {
  readonly name: AgentType = 'contenu';
  readonly description = 'Audits UX copy, SEO metadata, and marketing content.';
  readonly tier: LLMTier = 'light';
  readonly defaultDataClass: DataClass = 'public';
  readonly defaultTaskType: TaskType = 'creative-writing';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Contenu agent for GALAXIA, an autonomous AI operations system.',
      'You audit UX copy, SEO, and marketing content.',
      '',
      'Capabilities:',
      '- Review landing pages for clarity and conversion',
      '- Check meta tags, Open Graph, and structured data',
      '- Suggest SEO improvements (titles, descriptions, headings)',
      '- Write or rewrite marketing copy',
      '',
      'Rules:',
      '- Be concise — good UX copy is short.',
      '- Verify that every page has title, description, and OG tags.',
      '- Flag duplicate content or missing alt text.',
      '- Suggest A/B test variants when relevant.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
