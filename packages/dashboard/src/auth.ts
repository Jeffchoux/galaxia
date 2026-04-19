// GALAXIA Dashboard — session auth.
//
// Cookie-based session (24h TTL, random 32-byte token). Passwords
// verified via Phase 7's scrypt helpers. Session store is in-memory —
// a daemon restart invalidates everything (acceptable for MVP).

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { GalaxiaConfig, GalaxiaUser } from '@galaxia/core';
import { authenticateByPassword } from '@galaxia/core';

export interface Session {
  token: string;
  userName: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();

export function createSession(userName: string): Session {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const s: Session = {
    token,
    userName,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(token, s);
  return s;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function lookupSession(token: string | null, config: GalaxiaConfig): GalaxiaUser | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = (config.users ?? []).find((u) => u.name === s.userName);
  return user ?? null;
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

/** Attempt login with {userName, password} against config.users. */
export function tryLogin(userName: string, password: string, config: GalaxiaConfig): GalaxiaUser | null {
  return authenticateByPassword(userName, password, config);
}

/** Sanity: timing-safe string compare for any constant-time check we add. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Clean up expired sessions periodically (called from server bootstrap). */
export function startSessionSweeper(): NodeJS.Timeout {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [token, s] of sessions) {
      if (s.expiresAt < now) sessions.delete(token);
    }
  }, 60_000);
  t.unref?.();
  return t;
}

/** Expose store size for tests / debug. */
export function sessionCount(): number {
  return sessions.size;
}
