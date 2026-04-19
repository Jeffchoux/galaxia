// GALAXIA Watcher — barrel.

export type { WatchSource, WatchFinding } from './types.js';
export {
  WATCHER_DEFAULT_INTERVAL_HOURS,
  WATCHER_MIN_INTERVAL_HOURS,
  WATCHER_FINDING_BODY_MAX,
  WATCHER_FEED_CAP_ENTRIES,
} from './types.js';

export { watcherFeedPath, appendFinding, loadFindings, loadFindingsForProject } from './feed.js';
export { fetchHackerNews, fetchArxiv, fetchUrlContent } from './sources.js';
export type { RawEntry } from './sources.js';
export { analyzeRawEntry, rawEntryToFinding, analyzeUserSubmission } from './analyze.js';
export { runScanOnce, runWatcherLoop } from './loop.js';
export type { WatcherHandle } from './loop.js';
export { ingestSubmission } from './ingest.js';
export type { IngestInput } from './ingest.js';
