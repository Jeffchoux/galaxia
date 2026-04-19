// GALAXIA General Manager — loop.
//
// runGMLoop(project, gmConfig, galaxiaConfig) starts a setInterval that
// calls ProjectGM.review() every `intervalMinutes`. Returns a handle
// with stop() so the daemon can shut the loops down cleanly on SIGTERM.

import type { GalaxiaConfig, Project } from '../types.js';
import { ProjectGM, type ProjectGMOptions } from './manager.js';
import { loadGMState, saveGMState } from './persistence.js';
import type { GMConfig } from './types.js';
import { GM_DEFAULT_INTERVAL_MIN, GM_MIN_INTERVAL_MIN } from './types.js';

export interface GMLoopHandle {
  project: string;
  gm: ProjectGM;
  stop(): void;
}

export function runGMLoop(
  project: Project,
  gmConfig: GMConfig | undefined,
  config: GalaxiaConfig,
  options: ProjectGMOptions = {},
  log: (msg: string) => void = (m) => console.error(`[gm:${project.name}] ${m}`),
): GMLoopHandle | null {
  if (!gmConfig?.enabled) return null;
  const intervalMin = Math.max(GM_MIN_INTERVAL_MIN, gmConfig.intervalMinutes ?? GM_DEFAULT_INTERVAL_MIN);
  const intervalMs = intervalMin * 60 * 1000;

  const gm = new ProjectGM(project, gmConfig, config, options);

  // Mark enabled in persisted state the first time we see the project.
  const state = loadGMState(config.dataDir, project.name);
  if (!state.enabled) {
    saveGMState(config.dataDir, { ...state, enabled: true });
  }

  log(`loop start — interval=${intervalMin}min`);
  // Kick off the first review immediately so tests don't wait 30min.
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try { await gm.review(); }
    catch (err) { log(`review error: ${(err as Error).message}`); }
    finally { running = false; }
  };

  const initial = setTimeout(() => void tick(), 1_000);
  const interval = setInterval(() => void tick(), intervalMs);
  // Don't pin the event loop for the GM — daemon shutdown shouldn't hang.
  initial.unref?.();
  interval.unref?.();

  return {
    project: project.name,
    gm,
    stop(): void {
      clearTimeout(initial);
      clearInterval(interval);
      log('loop stopped');
    },
  };
}
