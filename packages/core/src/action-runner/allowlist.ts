// GALAXIA Action Runner — allowlist helpers.
//
// Single source of truth for "is this command / URL allowed?". Kept
// separate so handlers stay boring and the rules are easy to audit.

export function normalizeShell(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

/**
 * Returns true if `command` is allowed under `allowlist`.
 *
 * Matching rule: a command matches an allowlist entry when the normalized
 * command either equals the entry OR starts with `entry + ' '` (so
 * `"pnpm -w build"` in allowlist covers `"pnpm -w build"` and
 * `"pnpm -w build --filter @galaxia/core"`). This lets operators express
 * subcommands without listing every arg combination, without opening the
 * door to arbitrary pipes.
 *
 * Returns false for anything containing shell metacharacters (`;`, `&&`,
 * `||`, `|`, backticks, `$(`, `>`, `<`) — those imply a composite command
 * that must be expressed as separate allowlist entries if needed.
 */
export function shellIsAllowed(command: string, allowlist: string[] | undefined): boolean {
  if (!allowlist || allowlist.length === 0) return false;
  const normalized = normalizeShell(command);
  if (/[;&|`<>]/.test(normalized) || /\$\(/.test(normalized)) return false;
  for (const entry of allowlist) {
    const n = normalizeShell(entry);
    if (!n) continue;
    if (normalized === n) return true;
    if (normalized.startsWith(n + ' ')) return true;
  }
  return false;
}

/** Extract hostname from URL, returning null on malformed input. */
export function urlHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns true if `url`'s hostname is an EXACT match for one of `allowlist`.
 * No wildcard / suffix matching — explicit list for audit clarity.
 */
export function domainIsAllowed(url: string, allowlist: string[] | undefined): boolean {
  if (!allowlist || allowlist.length === 0) return false;
  const host = urlHost(url);
  if (!host) return false;
  return allowlist.some((d) => d.toLowerCase() === host);
}

/**
 * Path guard: returns true when `absPath` is strictly inside `rootPath`.
 * Uses prefix + separator check to avoid the classic `/foo` matching
 * `/foobar` bug. Expects normalized absolute paths.
 */
export function pathIsUnder(absPath: string, rootPath: string): boolean {
  if (!absPath.startsWith('/') || !rootPath.startsWith('/')) return false;
  const root = rootPath.replace(/\/+$/, '');
  if (absPath === root) return true;
  return absPath.startsWith(root + '/');
}
