// GALAXIA — git sync guard for pieces.
//
// Problème à éviter : Jeff (ou un collaborateur) peut pousser des commits
// sur le repo GitHub d'un projet depuis une autre machine, pendant que
// Galaxia travaille localement dans /opt/galaxia/projects/<piece>/.
// Si le GM ignore ces changements, on diverge. Règle : au début de chaque
// cycle GM (et sur /sync explicite), on synchronise :
//   1. fetch origin
//   2. si local clean + remote devant  → pull --ff-only (safe, jamais de merge)
//   3. si local sale (uncommitted)     → ABORT, flag à Jeff
//   4. si diverged (ahead + behind)    → ABORT, flag à Jeff (résolution manuelle)
//   5. si ahead seulement              → OK, laisser, rappeler push manuel à Jeff
//   6. si pas de remote configuré      → skip silencieusement (repo local-only)
//
// Aucune opération destructive. Aucune merge automatique. Aucun push.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type SyncOutcome =
  | { ok: true; action: 'pulled'; behind: number; newHead: string }
  | { ok: true; action: 'in-sync' }
  | { ok: true; action: 'ahead-only'; ahead: number }
  | { ok: true; action: 'no-git' }
  | { ok: true; action: 'no-remote' }
  | { ok: false; reason: 'dirty'; dirtyFiles: number }
  | { ok: false; reason: 'diverged'; ahead: number; behind: number }
  | { ok: false; reason: 'fetch-failed'; error: string }
  | { ok: false; reason: 'pull-failed'; error: string }
  | { ok: false; reason: 'exec-error'; error: string };

function git(args: string[], cwd: string, timeoutMs: number = 30_000): { stdout: string; stderr: string; status: number | null; error?: Error } {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: timeoutMs });
  return {
    stdout: (res.stdout ?? '').toString(),
    stderr: (res.stderr ?? '').toString(),
    status: res.status,
    error: res.error,
  };
}

/**
 * Vérifie + applique la sync. Ne throw jamais — retourne toujours un SyncOutcome.
 */
export async function syncPiece(projectPath: string): Promise<SyncOutcome> {
  // 1. Pas de .git ? → skip silencieusement (placeholder, ou repo retiré).
  if (!existsSync(join(projectPath, '.git'))) {
    return { ok: true, action: 'no-git' };
  }

  // 2. Pas de remote origin configuré ? → skip.
  const remote = git(['remote'], projectPath);
  if (remote.error) return { ok: false, reason: 'exec-error', error: remote.error.message };
  if (!remote.stdout.split('\n').some((l) => l.trim() === 'origin')) {
    return { ok: true, action: 'no-remote' };
  }

  // 3. Fetch (via SSH — silencieux si la clé est en place).
  const fetch = git(['fetch', '--quiet', 'origin'], projectPath, 30_000);
  if (fetch.status !== 0) {
    return { ok: false, reason: 'fetch-failed', error: (fetch.stderr || 'git fetch failed').slice(0, 200) };
  }

  // 4. Local dirty ? (uncommitted changes) → ABORT.
  const statusOut = git(['status', '--porcelain'], projectPath);
  if (statusOut.status !== 0) return { ok: false, reason: 'exec-error', error: statusOut.stderr.slice(0, 200) };
  const dirtyLines = statusOut.stdout.split('\n').filter((l) => l.trim().length > 0);
  if (dirtyLines.length > 0) {
    return { ok: false, reason: 'dirty', dirtyFiles: dirtyLines.length };
  }

  // 5. Compter ahead/behind via rev-list.
  const aheadBehind = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], projectPath);
  if (aheadBehind.status !== 0) {
    // Probablement pas d'upstream tracking → on considère "in-sync" prudent.
    return { ok: true, action: 'in-sync' };
  }
  const [aheadStr, behindStr] = aheadBehind.stdout.trim().split(/\s+/);
  const ahead = Number(aheadStr ?? 0);
  const behind = Number(behindStr ?? 0);

  if (ahead === 0 && behind === 0) return { ok: true, action: 'in-sync' };
  if (ahead > 0 && behind > 0) return { ok: false, reason: 'diverged', ahead, behind };
  if (ahead > 0 && behind === 0) return { ok: true, action: 'ahead-only', ahead };

  // behind only → safe pull ff-only.
  const pull = git(['pull', '--ff-only', '--quiet'], projectPath, 60_000);
  if (pull.status !== 0) {
    return { ok: false, reason: 'pull-failed', error: (pull.stderr || 'git pull failed').slice(0, 200) };
  }
  const head = git(['rev-parse', '--short', 'HEAD'], projectPath);
  return { ok: true, action: 'pulled', behind, newHead: head.stdout.trim() };
}

/** Render court pour les logs / journal / Telegram. */
export function describeSyncOutcome(out: SyncOutcome): string {
  if (!out.ok) {
    switch (out.reason) {
      case 'dirty':        return `⚠️ local a ${out.dirtyFiles} fichier(s) non commités — sync bloqué, GM skip ce cycle`;
      case 'diverged':     return `⚠️ diverged (+${out.ahead} local, +${out.behind} remote) — résolution manuelle nécessaire`;
      case 'fetch-failed': return `❌ fetch échoué: ${out.error}`;
      case 'pull-failed':  return `❌ pull ff-only échoué: ${out.error}`;
      case 'exec-error':   return `❌ git exec error: ${out.error}`;
    }
  } else {
    switch (out.action) {
      case 'pulled':       return `✓ pulled ${out.behind} commit(s) → HEAD ${out.newHead}`;
      case 'in-sync':      return `✓ in sync avec origin`;
      case 'ahead-only':   return `✓ local ahead de ${out.ahead} commit(s) — à push manuellement quand prêt`;
      case 'no-git':       return `· pas de .git (placeholder)`;
      case 'no-remote':    return `· pas de remote origin configuré`;
    }
  }
}
