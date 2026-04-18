import type {
  AgentType,
  LLMTier,
  KnowledgeEntry,
  DataClass,
  TaskType,
  RoutingContext,
} from '@galaxia/core';
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

  /**
   * Default data-class for this role's outputs. Used by `routingContext()` to
   * tell the Pilier 4.bis routing engine what confidentiality bucket the
   * prompt falls into. Each concrete role sets this (see docs/MANIFESTO.md
   * § Pilier 4.bis for the taxonomy).
   */
  abstract readonly defaultDataClass: DataClass;

  /**
   * Default task-type for this role. Rules in `galaxia.yml` match on this to
   * pick a provider (e.g. `taskType: creative-writing` → Claude).
   */
  abstract readonly defaultTaskType: TaskType;

  abstract getSystemPrompt(ctx: AgentContext): string;

  /**
   * Build the RoutingContext passed to `callLLM()`. Defaults to the role's
   * declared data-class and task-type, scoped to the current project. Roles
   * may override this to compute a context dynamically from the task string
   * (e.g. detect "secret" data, switch to `strictLocalOnly`).
   */
  protected routingContext(_task: string, ctx: AgentContext): RoutingContext {
    return {
      dataClass: this.defaultDataClass,
      taskType: this.defaultTaskType,
      projectTag: ctx.project.name,
    };
  }

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
      const { text } = await callLLM(
        this.routingContext(task, ctx),
        prompt,
        ctx.config,
      );
      const parsed = parseResponse(text);

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
