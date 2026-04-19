// GALAXIA — détection session Claude Code interactive de Jeff.
//
// Principe : Jeff lance Claude Code (cette conversation) et chaque tool
// use touche un heartbeat file. Le daemon Galaxia lit la mtime de ce
// fichier. Si < 5 min → session active → Galaxia évite Claude tier heavy
// (pour ne pas épuiser la fenêtre Max 5h partagée). Sinon → Claude Max
// CLI dispo pour Galaxia comme prévu.
//
// Hook côté Claude Code : /opt/galaxia/.claude/settings.json contient un
// PostToolUse qui `touch /tmp/claude-max-active.lock`. Mise à jour
// transparente pour Jeff.

import { statSync } from 'node:fs';

export const CLAUDE_MAX_HEARTBEAT_PATH = '/tmp/claude-max-active.lock';
export const CLAUDE_MAX_HEARTBEAT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ClaudeMaxHeartbeatInfo {
  /** true si le heartbeat existe ET a été touché dans les TTL dernières ms. */
  busy: boolean;
  /** Âge du dernier heartbeat en ms (undefined si fichier absent). */
  ageMs?: number;
  /** mtime du fichier (ISO). */
  lastSeenAt?: string;
}

export function claudeMaxHeartbeat(): ClaudeMaxHeartbeatInfo {
  try {
    const st = statSync(CLAUDE_MAX_HEARTBEAT_PATH);
    const age = Date.now() - st.mtimeMs;
    return {
      busy: age < CLAUDE_MAX_HEARTBEAT_TTL_MS,
      ageMs: age,
      lastSeenAt: new Date(st.mtimeMs).toISOString(),
    };
  } catch {
    return { busy: false };
  }
}

/** Boolean shortcut. */
export function isClaudeMaxBusy(): boolean {
  return claudeMaxHeartbeat().busy;
}
