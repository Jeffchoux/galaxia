// GALAXIA Global Watcher — tech watch shared across all projects.
//
// Runs every 4h, fetches curated sources (Hacker News, Arxiv, etc.),
// asks an LLM to filter/summarize in the context of Galaxia projects,
// persists findings to a shared JSONL. Also accepts user-submitted
// content via /watch Telegram (URL or free text) for on-demand analysis.

export type WatchSource = 'hacker-news' | 'arxiv' | 'user-telegram' | 'user-dashboard';

export interface WatchFinding {
  id: string;
  ts: string;                       // ISO
  source: WatchSource;
  /** Short one-liner summary — the thing to display in a feed. */
  summary: string;
  /** Optional canonical URL when applicable. */
  url?: string;
  /** Free tags inferred by the LLM (e.g. ['typescript','supabase','rls']). */
  tags: string[];
  /** Project names the watcher thinks are relevant (subset of config.projects names). */
  relevantProjects: string[];
  /** Full extracted text (capped). Kept for GM context injection. */
  body?: string;
  /** For user submissions, who sent it. */
  submittedBy?: string;
}

export const WATCHER_DEFAULT_INTERVAL_HOURS = 4;
export const WATCHER_MIN_INTERVAL_HOURS = 1;
export const WATCHER_FINDING_BODY_MAX = 4000;   // cap per finding to keep the feed lean
export const WATCHER_FEED_CAP_ENTRIES = 5000;   // rotate/trim if file grows past this
