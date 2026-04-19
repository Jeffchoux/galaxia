// GALAXIA Watcher — analyze: LLM summarize + relevance filter.

import { randomUUID } from 'node:crypto';
import type { GalaxiaConfig } from '../types.js';
import { callLLM } from '../llm-router.js';
import type { WatchFinding, WatchSource } from './types.js';
import { WATCHER_FINDING_BODY_MAX } from './types.js';
import type { RawEntry } from './sources.js';

interface LlmFinding {
  summary: string;
  tags: string[];
  relevantProjects: string[];
}

/**
 * Ask the LLM to:
 *  - produce a 1-line summary of the raw entry
 *  - tag it (tech keywords)
 *  - select which of this instance's projects would care
 *
 * Returns null when the entry is judged noise — caller drops it.
 */
export async function analyzeRawEntry(
  entry: RawEntry,
  config: GalaxiaConfig,
): Promise<LlmFinding | null> {
  const projectNames = (config.projects ?? []).map((p) => p.name);
  const projectHints = (config.projects ?? [])
    .map((p) => `- ${p.name}: ${p.description ?? '(no description)'}`)
    .join('\n');

  const prompt = [
    'Tu filtres un flux de veille tech pour Galaxia OS. Tu reçois une entrée brute (HN, Arxiv, ou soumission user).',
    '',
    'Réponds STRICTEMENT en JSON sur une ligne, sans markdown, schéma :',
    '  {"relevant":true|false,"summary":"<1 ligne FR>","tags":["a","b"],"relevantProjects":["<name>", ...]}',
    '',
    'Règles:',
    '- "relevant":false si c\'est du contenu non-tech, politique, clickbait, daily discussions.',
    '- "relevantProjects" ne contient que des noms EXACTS dans la liste ci-dessous. Vide si aucune correspondance claire.',
    '- tags: 3 max, kebab-case, concrets (ex: "typescript", "supabase-rls", "next-14", "e2e-testing").',
    '- summary: ≤ 120 caractères, en français, factuel, pas "intéressant" ni "pertinent".',
    '',
    `Projets actifs :\n${projectHints || '(none)'}`,
    '',
    'Entrée brute :',
    `Source: ${entry.source}`,
    `Titre: ${entry.title}`,
    entry.url ? `URL: ${entry.url}` : '',
    `Corps: ${entry.body.slice(0, 1500)}`,
  ].filter(Boolean).join('\n');

  try {
    const { text } = await callLLM(
      { dataClass: 'public', taskType: 'watcher-analyze' },
      prompt,
      config,
    );
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { relevant?: boolean; summary?: string; tags?: string[]; relevantProjects?: string[] };
    if (!parsed.relevant) return null;
    return {
      summary: String(parsed.summary ?? entry.title).slice(0, 200),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      relevantProjects: Array.isArray(parsed.relevantProjects)
        ? parsed.relevantProjects.filter((n) => typeof n === 'string' && projectNames.includes(n))
        : [],
    };
  } catch {
    return null;
  }
}

export function rawEntryToFinding(entry: RawEntry, analysis: LlmFinding, submittedBy?: string): WatchFinding {
  return {
    id: randomUUID(),
    ts: new Date().toISOString(),
    source: entry.source as WatchSource,
    summary: analysis.summary,
    url: entry.url,
    tags: analysis.tags,
    relevantProjects: analysis.relevantProjects,
    body: entry.body.slice(0, WATCHER_FINDING_BODY_MAX),
    submittedBy,
  };
}

/**
 * For a user-submitted free-text blob (pas de fetch URL), construire un
 * faux RawEntry et l'analyser directement. Utilisé par /watch Telegram.
 */
export async function analyzeUserSubmission(
  body: string,
  title: string,
  url: string | undefined,
  source: 'user-telegram' | 'user-dashboard',
  submittedBy: string,
  config: GalaxiaConfig,
): Promise<WatchFinding | null> {
  const raw: RawEntry = {
    source: (source === 'user-telegram' ? 'hacker-news' : 'hacker-news'),
    // (we keep source at the finding layer, not the raw layer — but analyze
    // doesn't care; the tag of origin is preserved in the final Finding)
    title,
    url,
    body: body.slice(0, 8000),
    ts: new Date().toISOString(),
  };
  const analysis = await analyzeRawEntry(raw, config);
  if (!analysis) {
    // Even if the LLM thinks non-relevant, an explicit /watch submission
    // means Jeff thinks it matters — keep it with a minimal summary.
    return {
      id: randomUUID(),
      ts: new Date().toISOString(),
      source,
      summary: title.slice(0, 200) || body.slice(0, 120),
      url,
      tags: [],
      relevantProjects: [],
      body: body.slice(0, WATCHER_FINDING_BODY_MAX),
      submittedBy,
    };
  }
  const finding = rawEntryToFinding(raw, analysis, submittedBy);
  finding.source = source;
  return finding;
}
