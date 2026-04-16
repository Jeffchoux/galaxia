import type { AgentType, LLMTier, KnowledgeEntry } from '@galaxia/core';
import { callLLM } from '@galaxia/core';
import type { AgentContext, AgentResult, AgentRole } from './types.js';

/**
 * Parse structured sections from the LLM response.
 *
 * Expects the LLM to return sections delimited by headers like:
 *   ## Summary
 *   ## Actions
 *   ## Knowledge
 *   ## Errors
 */
function parseResponse(raw: string): {
  summary: string;
  actions: string[];
  knowledge: KnowledgeEntry[];
  errors: string[];
} {
  const summary = extractSection(raw, 'Summary') || raw.slice(0, 500);
  const actions = extractList(raw, 'Actions');
  const errors = extractList(raw, 'Errors');

  const knowledgeLines = extractList(raw, 'Knowledge');
  const knowledge: KnowledgeEntry[] = knowledgeLines.map((line) => ({
    date: new Date().toISOString().split('T')[0]!,
    category: 'agent-learned',
    content: line,
  }));

  return { summary, actions, knowledge, errors };
}

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = regex.exec(text);
  return match?.[1]?.trim() ?? '';
}

function extractList(text: string, heading: string): string[] {
  const section = extractSection(text, heading);
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Abstract base class for all GALAXIA agents.
 *
 * Subclasses must provide:
 *  - `name` and `description`
 *  - `tier` to control which LLM provider is used
 *  - `getSystemPrompt(ctx)` returning the system-level instruction
 *
 * The `run()` method handles the full lifecycle: prompt assembly,
 * LLM call, response parsing, and error handling.
 */
export abstract class BaseAgent implements AgentRole {
  abstract readonly name: AgentType;
  abstract readonly description: string;
  abstract readonly tier: LLMTier;

  abstract getSystemPrompt(ctx: AgentContext): string;

  /**
   * Build the full prompt by combining the system prompt with
   * project context and the specific task.
   */
  protected buildPrompt(task: string, ctx: AgentContext): string {
    const systemPrompt = this.getSystemPrompt(ctx);

    return [
      systemPrompt,
      '',
      '---',
      '',
      `Project: ${ctx.project.name}`,
      `Path: ${ctx.project.path}`,
      ctx.project.description ? `Description: ${ctx.project.description}` : null,
      '',
      `Task: ${task}`,
      '',
      'Respond with these sections:',
      '## Summary',
      'Brief summary of what you found or did.',
      '',
      '## Actions',
      '- List each action taken or recommended, one per line.',
      '',
      '## Knowledge',
      '- Any new facts or insights worth remembering.',
      '',
      '## Errors',
      '- Any errors encountered (leave empty if none).',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  /**
   * Execute the agent's task. Builds the prompt, calls the LLM via
   * the core router, and parses the structured response.
   */
  async run(task: string, ctx: AgentContext): Promise<AgentResult> {
    try {
      const prompt = this.buildPrompt(task, ctx);
      const raw = await callLLM(this.tier, prompt, ctx.config);
      const parsed = parseResponse(raw);

      return {
        success: parsed.errors.length === 0,
        summary: parsed.summary,
        actions: parsed.actions,
        knowledgeLearned: parsed.knowledge,
        errors: parsed.errors,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: `Agent ${this.name} failed: ${message}`,
        actions: [],
        knowledgeLearned: [],
        errors: [message],
      };
    }
  }
}
