// GALAXIA General Manager — brain (LLM decision).
//
// Builds a GM-scoped prompt that asks the LLM: "given this project state
// and these objectives, what's the single next best move?" Returns a
// structured GMDecision. Parsing is defensive — if the LLM produces
// garbage we return a `wait` decision rather than throwing.

import type { GalaxiaConfig, Project, AgentType } from '../types.js';
import { callLLM } from '../llm-router.js';
import type { GMConfig, GMDecision, GMState } from './types.js';

const KNOWN_AGENTS: AgentType[] = [
  'dev', 'cicd', 'test', 'analyse', 'controle',
  'veille', 'ideas', 'contenu', 'review', 'maintenance',
];

export async function decideNext(
  project: Project,
  state: GMState,
  gmConfig: GMConfig | undefined,
  config: GalaxiaConfig,
): Promise<GMDecision> {
  const systemPrompt = [
    `You are the General Manager IA for the "${project.name}" project.`,
    'You track its objectives, its recent actions, and decide the single next best move.',
    'Output STRICT JSON on a single line — no markdown fences, no prose around it.',
    '',
    'Schema:',
    '  {"kind":"dispatch","agent":"<one of: dev|cicd|test|analyse|controle|veille|ideas|contenu|review|maintenance>","task":"<short task string>","reason":"<why>","priority":1..5}',
    '  {"kind":"wait","reason":"<why>","untilNextReviewIn":<optional minutes>}',
    '  {"kind":"drop-objective","objectiveId":"<id>","reason":"<why>"}',
    '',
    'Pick wait when you have no confident move or when an agent was just dispatched for the same task.',
    gmConfig?.extraSystem ?? '',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    project.description ? `Description: ${project.description}` : null,
    '',
    `Current objectives (${state.currentObjectives.length}):`,
    state.currentObjectives.length === 0
      ? '  (none — decide based on generic project health)'
      : state.currentObjectives.map((o) => `  [${o.id}] (${o.priority ?? 3}) ${o.description}`).join('\n'),
    '',
    `Recent GM actions (last ${Math.min(state.recentActions.length, 5)}):`,
    state.recentActions.slice(-5).map((a) => `  ${a.ts} ${a.kind} ${a.agent ?? ''} ${a.task ?? ''} (${a.reason})`).join('\n') || '  (none)',
    '',
    `Health score: ${state.healthScore.toFixed(2)}`,
    `Cycles run: ${state.cyclesRun}`,
    '',
    'Return the single JSON object. Nothing else.',
  ].filter(Boolean).join('\n');

  try {
    const { text } = await callLLM(
      {
        dataClass: 'professional',
        taskType: 'triage',
        projectTag: project.name,
      },
      `${systemPrompt}\n\n---\n\n${userPrompt}`,
      config,
    );
    return parseGMDecision(text);
  } catch (err) {
    return {
      kind: 'wait',
      reason: `GM brain error: ${(err as Error).message.slice(0, 120)}`,
    };
  }
}

export function parseGMDecision(raw: string): GMDecision {
  // Extract the first {...} block — accommodates stray prose, code fences.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { kind: 'wait', reason: 'GM brain returned no JSON' };
  try {
    const parsed = JSON.parse(match[0]) as Partial<GMDecision> & { kind?: string };
    if (parsed.kind === 'dispatch' && 'agent' in parsed && 'task' in parsed) {
      const agent = (parsed.agent as string) as AgentType;
      if (!KNOWN_AGENTS.includes(agent)) return { kind: 'wait', reason: `unknown agent ${agent}` };
      return {
        kind: 'dispatch',
        agent,
        task: String((parsed as { task: unknown }).task).slice(0, 400),
        reason: String((parsed as { reason?: unknown }).reason ?? '').slice(0, 200),
        priority: clampPriority((parsed as { priority?: unknown }).priority),
      };
    }
    if (parsed.kind === 'drop-objective' && 'objectiveId' in parsed) {
      return {
        kind: 'drop-objective',
        objectiveId: String((parsed as { objectiveId: unknown }).objectiveId),
        reason: String((parsed as { reason?: unknown }).reason ?? '').slice(0, 200),
      };
    }
    return {
      kind: 'wait',
      reason: String((parsed as { reason?: unknown }).reason ?? 'unspecified').slice(0, 200),
      untilNextReviewIn: typeof (parsed as { untilNextReviewIn?: unknown }).untilNextReviewIn === 'number'
        ? (parsed as { untilNextReviewIn: number }).untilNextReviewIn
        : undefined,
    };
  } catch {
    return { kind: 'wait', reason: 'GM brain JSON parse failed' };
  }
}

function clampPriority(v: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = typeof v === 'number' ? Math.round(v) : 3;
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as 1 | 2 | 3 | 4 | 5;
}
