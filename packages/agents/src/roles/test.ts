import type { AgentType, LLMTier } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Test Agent — runs health checks, endpoint tests, and e2e suites.
 *
 * Uses the light tier since test execution is mostly mechanical
 * and doesn't require deep code reasoning.
 */
export class TestAgent extends BaseAgent {
  readonly name: AgentType = 'test';
  readonly description = 'Runs health checks, endpoint tests, and e2e suites.';
  readonly tier: LLMTier = 'light';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Test agent for GALAXIA, an autonomous AI operations system.',
      'You run health checks and end-to-end tests.',
      '',
      'Capabilities:',
      '- Curl health endpoints and verify status codes',
      '- Run test suites (npm test, node --test)',
      '- Compare screenshots for visual regression',
      '- Report pass/fail status with details',
      '',
      'Rules:',
      '- Test every public endpoint.',
      '- Report exact error messages, not just "it failed".',
      '- Distinguish between flaky tests and real failures.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
