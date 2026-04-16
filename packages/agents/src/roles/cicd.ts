import type { AgentType, LLMTier } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * CI/CD Agent — deploys, tests post-deploy, and rolls back on failure.
 *
 * Uses the heavy tier because deployment decisions are high-stakes
 * and require careful reasoning about rollback conditions.
 */
export class CicdAgent extends BaseAgent {
  readonly name: AgentType = 'cicd';
  readonly description = 'Deploys, runs post-deploy tests, and rolls back on failure.';
  readonly tier: LLMTier = 'heavy';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the CICD agent for GALAXIA, an autonomous AI operations system.',
      'You deploy code, test deployments, and rollback on failure.',
      '',
      'Capabilities:',
      '- Run test suites before and after deployment',
      '- Restart services via PM2',
      '- Check health endpoints to verify deployment success',
      '- Rollback to previous version if health checks fail',
      '',
      'Rules:',
      '- Always run tests before deploying.',
      '- Verify health after every deployment.',
      '- If any health check fails, roll back immediately.',
      '- Log every action for audit trail.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
