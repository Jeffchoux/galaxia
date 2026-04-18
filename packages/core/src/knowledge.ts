// GALAXIA Knowledge System — port of KNOWLEDGE.md per-project logs
// Format: ## YYYY-MM-DD | category\n content

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KnowledgeEntry } from './types.js';
import { knowledgeFilePath } from './paths.js';

/**
 * Parse KNOWLEDGE.md into structured entries.
 * Expected format:
 * ## 2026-04-16 | bugfix
 * Fixed login timeout issue by increasing session TTL.
 */
export function loadKnowledge(project: string, dataDir?: string): KnowledgeEntry[] {
  const filePath = knowledgeFilePath(project, dataDir);

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return parseKnowledgeMd(raw, project);
  } catch (err) {
    console.error(`[knowledge] Failed to load for ${project}:`, (err as Error).message);
    return [];
  }
}

function parseKnowledgeMd(content: string, project: string): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const sections = content.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0];

    // Parse header: "2026-04-16 | category"
    const match = header.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
    if (!match) continue;

    const [, date, category] = match;
    const body = lines.slice(1).join('\n').trim();
    if (!body) continue;

    entries.push({
      date,
      category: category.trim(),
      content: body,
      project,
    });
  }

  return entries;
}

/**
 * Append a new knowledge entry to the project's KNOWLEDGE.md.
 */
export function addKnowledge(project: string, entry: KnowledgeEntry, dataDir?: string): void {
  const filePath = knowledgeFilePath(project, dataDir);
  mkdirSync(dirname(filePath), { recursive: true });

  const block = `\n## ${entry.date} | ${entry.category}\n${entry.content}\n`;

  try {
    if (!existsSync(filePath)) {
      writeFileSync(filePath, `# Knowledge — ${project}\n${block}`, 'utf-8');
    } else {
      appendFileSync(filePath, block, 'utf-8');
    }
  } catch (err) {
    console.error(`[knowledge] Failed to add for ${project}:`, (err as Error).message);
  }
}

/**
 * Simple keyword search across knowledge entries.
 * Returns entries where any keyword appears in content or category.
 */
export function searchKnowledge(project: string, query: string, dataDir?: string): KnowledgeEntry[] {
  const entries = loadKnowledge(project, dataDir);
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (keywords.length === 0) return entries;

  return entries.filter((entry) => {
    const text = `${entry.category} ${entry.content}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
}
