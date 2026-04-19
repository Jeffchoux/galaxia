// GALAXIA Watcher — ingest user submissions (Telegram /watch, dashboard).

import type { GalaxiaConfig } from '../types.js';
import type { WatchFinding } from './types.js';
import { fetchUrlContent } from './sources.js';
import { analyzeUserSubmission } from './analyze.js';
import { appendFinding } from './feed.js';

export interface IngestInput {
  rawText: string;
  submittedBy: string;
  source: 'user-telegram' | 'user-dashboard';
}

/**
 * Accept a free-form submission: pure text, a URL, or text-with-URL.
 *  - If a URL is present, fetch it and use the extracted page as body.
 *  - Otherwise treat the text as the body.
 * Returns the resulting Finding (persisted) or null if nothing useful.
 */
export async function ingestSubmission(input: IngestInput, config: GalaxiaConfig): Promise<WatchFinding | null> {
  const urlMatch = input.rawText.match(/https?:\/\/[^\s]+/);
  let title = input.rawText.slice(0, 160);
  let body = input.rawText;
  let url: string | undefined;
  if (urlMatch) {
    url = urlMatch[0];
    const fetched = await fetchUrlContent(url);
    if (fetched) {
      title = fetched.title || title;
      body = (input.rawText.replace(url, '').trim() + '\n\n' + fetched.body).trim();
    }
  }
  const finding = await analyzeUserSubmission(body, title, url, input.source, input.submittedBy, config);
  if (!finding) return null;
  appendFinding(config.dataDir, finding);
  return finding;
}
