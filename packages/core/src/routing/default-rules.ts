// GALAXIA — Default routing rules, aligned with the manifesto (Pilier 4.bis).
//
// These apply when the user's config either has no rules or its rules don't
// match. They encode the Galaxia doctrine:
//   - confidential / secret data never leaves the machine (local, no fallback)
//   - personal data prefers local
//   - public content can hit the light tier (cheap cloud)
//   - professional code-gen uses the heavy tier (strong reasoning)
//
// Users override, extend, or entirely replace these via config.routing.rules.

import type { RoutingRule } from './types.js';

export const DEFAULT_RULES: RoutingRule[] = [
  {
    name: '__default_confidential__',
    description:
      'Confidential/secret data stays on-device. Never fall back to a remote provider.',
    when: { dataClassIn: ['confidential', 'secret'] },
    then: { tier: 'local', forbidFallback: true },
  },
  {
    name: '__default_personal__',
    description: 'Personal data prefers local but may fall back if authorised.',
    when: { dataClass: 'personal' },
    then: { tier: 'local', forbidFallback: false },
  },
  {
    name: '__default_pro_codegen__',
    description:
      'Code generation on professional content: use the heavy tier for strong reasoning.',
    when: { dataClass: 'professional', taskType: 'code-gen' },
    then: { tier: 'heavy' },
  },
  {
    name: '__default_public__',
    description: 'Public content: cheap cloud tier.',
    when: { dataClass: 'public' },
    then: { tier: 'light' },
  },
];

/**
 * The catch-all used when no user rule and no default rule matches.
 * Expressed as a decision template (not a RoutingRule) because it has no
 * matching criteria.
 */
export const DEFAULT_FALLBACK_TIER = 'light' as const;
