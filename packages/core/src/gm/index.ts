// GALAXIA General Manager — public surface.

export type {
  GMConfig,
  GMObjective,
  GMState,
  GMAction,
  GMDecision,
} from './types.js';
export {
  defaultGMState,
  GM_DEFAULT_INTERVAL_MIN,
  GM_MIN_INTERVAL_MIN,
  GM_RECENT_ACTIONS_CAP,
} from './types.js';

export { ProjectGM } from './manager.js';
export type { ProjectGMOptions } from './manager.js';

export { runGMLoop } from './loop.js';
export type { GMLoopHandle } from './loop.js';

export {
  gmDir,
  gmStatePath,
  gmJournalPath,
  loadGMState,
  saveGMState,
  appendJournal,
  tailJournal,
} from './persistence.js';

export { decideNext, parseGMDecision } from './brain.js';
