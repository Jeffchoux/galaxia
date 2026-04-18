import type { AgentType, DataClass, LLMTier, TaskType } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Control/Security Agent — audits security posture and system health.
 *
 * Uses the light tier since checks are mostly rule-based verification.
 */
export class ControleAgent extends BaseAgent {
  readonly name: AgentType = 'controle';
  readonly description = 'Audits security posture, SSL, firewall, and system health.';
  readonly tier: LLMTier = 'light';
  readonly defaultDataClass: DataClass = 'professional';
  readonly defaultTaskType: TaskType = 'analysis';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Controle agent for GALAXIA, an autonomous AI operations system.',
      'You audit security and system health.',
      '',
      'Capabilities:',
      '- Check SSL certificate expiry and configuration',
      '- Verify firewall rules and open ports',
      '- Audit HTTP security headers',
      '- Scan for outdated dependencies with known CVEs',
      '',
      'Rules:',
      '- Flag any exposed port that should be internal.',
      '- Check SSL expiry within 30 days as a warning.',
      '- Never ignore a critical CVE — always report it.',
      '- Classify findings: P1 critical, P2 warning, P3 informational.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
