// GALAXIA Watcher — 4h scan loop.

import type { GalaxiaConfig } from '../types.js';
import type { WatchFinding } from './types.js';
import { WATCHER_DEFAULT_INTERVAL_HOURS, WATCHER_MIN_INTERVAL_HOURS } from './types.js';
import { fetchHackerNews, fetchArxiv } from './sources.js';
import { analyzeRawEntry, rawEntryToFinding } from './analyze.js';
import { appendFinding } from './feed.js';

export interface WatcherHandle {
  stop(): void;
}

/**
 * Run one scan pass: fetch sources, analyze each entry, write findings.
 * Returns the number of findings added. Safe to call manually.
 */
export async function runScanOnce(config: GalaxiaConfig, log: (m: string) => void): Promise<number> {
  // Volumes volontairement modestes : 8 entrées / scan x toutes les 4h =
  // 48 entrées/j, largement sous le rate limit gratuit de Groq (30 req/min).
  const [hn, arxiv] = await Promise.all([
    fetchHackerNews(5).catch(() => []),
    fetchArxiv(3).catch(() => []),
  ]);
  const raw = [...hn, ...arxiv];
  if (raw.length === 0) { log('scan: no entries fetched (network?)'); return 0; }
  log(`scan: ${raw.length} raw entries (HN=${hn.length}, arxiv=${arxiv.length}) — analyzing…`);

  let added = 0;
  let skipped = 0;
  for (const entry of raw) {
    try {
      // Wrap chaque analyse dans un timeout agressif (45s) pour qu'un
      // provider saturé ne bloque pas tout le scan. Si null -> entrée
      // skipped sans erreur.
      const analysis = await Promise.race([
        analyzeRawEntry(entry, config),
        new Promise<null>((r) => setTimeout(() => r(null), 45_000)),
      ]);
      if (!analysis) { skipped++; continue; }
      const finding: WatchFinding = rawEntryToFinding(entry, analysis);
      appendFinding(config.dataDir, finding);
      added++;
    } catch (err) {
      skipped++;
      log(`analyze error on "${entry.title.slice(0, 40)}": ${(err as Error).message}`);
    }
    // Petit sleep entre appels pour amortir les bursts sur le rate limit.
    await new Promise((r) => setTimeout(r, 1500));
  }
  log(`scan: ${added} kept, ${skipped} skipped (LLM down ou non-pertinent)`);
  return added;
}

export function runWatcherLoop(
  config: GalaxiaConfig,
  intervalHours: number = WATCHER_DEFAULT_INTERVAL_HOURS,
  log: (m: string) => void = (m) => console.error(`[watcher] ${m}`),
): WatcherHandle {
  const hours = Math.max(WATCHER_MIN_INTERVAL_HOURS, intervalHours);
  const intervalMs = hours * 60 * 60 * 1000;
  log(`loop start — interval=${hours}h`);
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try { await runScanOnce(config, log); }
    catch (err) { log(`scan error: ${(err as Error).message}`); }
    finally { running = false; }
  };
  // Kick off after 60s so we don't scan during daemon boot noise.
  const initial = setTimeout(() => void tick(), 60_000);
  const interval = setInterval(() => void tick(), intervalMs);
  initial.unref?.();
  interval.unref?.();
  return {
    stop(): void {
      clearTimeout(initial);
      clearInterval(interval);
      log('loop stopped');
    },
  };
}
