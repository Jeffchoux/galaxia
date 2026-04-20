// GALAXIA — classification de complexité d'une tâche LLM.
//
// Mapping heuristique taskType -> complexity (pas de LLM classifier pour
// ne pas cramer de tokens sur la classification elle-même). Détermine
// quel tier minimum doit servir la requête.

export type Complexity = 'trivial' | 'simple' | 'medium' | 'hard' | 'creative';

/**
 * Tâches → complexité. Valeurs par défaut. Surchargeable dans galaxia.yml
 * via les rules (qui assignent tier explicitement) — ceci est le fallback
 * quand aucune rule ne matche.
 */
const COMPLEXITY_BY_TASK: Record<string, Complexity> = {
  // Trivial
  classify: 'trivial',
  extract: 'trivial',
  label: 'trivial',
  tag: 'trivial',
  // Simple
  triage: 'simple',
  summary: 'simple',
  'watcher-analyze': 'simple',
  // Medium (default)
  analysis: 'medium',
  review: 'medium',
  'dashboard-chat': 'medium',
  // Hard (code tasks)
  'code-gen': 'hard',
  'code-review': 'hard',
  refactor: 'hard',
  architecture: 'hard',
  debugging: 'hard',
  // Creative
  'creative-writing': 'creative',
  essay: 'creative',
  brainstorm: 'creative',
};

export function classifyComplexity(taskType: string): Complexity {
  return COMPLEXITY_BY_TASK[taskType] ?? 'medium';
}

/**
 * Tier préféré pour une complexité donnée. Les tiers listés sont par
 * ordre décroissant de qualité — le premier est idéal, les suivants
 * sont les dégradations acceptables si le préféré est en cooldown.
 *
 * Les noms de tier sont ceux déclarés dans galaxia.yml (light, medium,
 * heavy, local). Une instance peut remapper via la clé `hierarchy` du
 * YAML (non utilisée en MVP — évolution prévue).
 */
export const COMPLEXITY_TIER_PREFERENCE: Record<Complexity, string[]> = {
  trivial:  ['light', 'local'],
  simple:   ['light', 'medium'],
  medium:   ['medium', 'light', 'heavy'],
  hard:     ['heavy', 'medium', 'light'],
  creative: ['heavy', 'medium', 'light'],
};
