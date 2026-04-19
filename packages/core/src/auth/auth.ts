// GALAXIA Core — authentication primitives for Phase 7 multi-user.
//
// Two auth channels are supported: Telegram (chat_id match) and web
// password (scrypt-hashed). Both return the same `GalaxiaUser` shape so
// downstream scope checks don't care how the user authenticated.
//
// Backward-compat: when `config.users` is empty or missing, Telegram
// whitelist falls back to `config.telegram.allowedChatIds`. Those chats
// are treated as a synthetic owner with scope `['*']`, so existing single-
// user installs keep working without touching galaxia.yml.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { GalaxiaConfig, GalaxiaUser } from '../types.js';
import { userCanAccess } from './scope.js';

// ── Telegram auth ──────────────────────────────────────────────────────────

export function findUserByTelegramChatId(
  chatId: number,
  config: GalaxiaConfig,
): GalaxiaUser | null {
  const users = config.users ?? [];
  for (const u of users) {
    const ids = u.auth?.telegramChatIds ?? [];
    if (chatIdMatches(chatId, ids)) return u;
  }

  // Legacy fallback: if no `users` block is declared yet, accept
  // telegram.allowedChatIds and synthesise an owner. Once the YAML grows a
  // real `users:` list, this path is never hit.
  if (users.length === 0) {
    const legacy = config.telegram?.allowedChatIds ?? [];
    if (chatIdMatches(chatId, legacy)) {
      return {
        name: config.owner ?? 'owner',
        role: 'owner',
        scope: ['*'],
        auth: { telegramChatIds: [chatId] },
      };
    }
  }
  return null;
}

/** @deprecated Prefer findUserByTelegramChatId — returns boolean for legacy callers. */
export function authenticateUser(chatId: number, config: GalaxiaConfig): GalaxiaUser | null {
  return findUserByTelegramChatId(chatId, config);
}

function chatIdMatches(chatId: number, allowed: (number | string)[]): boolean {
  for (const entry of allowed) {
    if (typeof entry === 'number' && entry === chatId) return true;
    if (typeof entry === 'string') {
      const n = Number(entry);
      if (Number.isFinite(n) && n === chatId) return true;
      if (entry === String(chatId)) return true;
    }
  }
  return false;
}

// ── Web password auth ──────────────────────────────────────────────────────
//
// Hash format is `scrypt$<salt-hex>$<hash-hex>`. Salt is 16 bytes, hash
// output is 64 bytes. `verifyPassword` uses constant-time compare. No new
// npm dep — scrypt ships with Node's crypto module.

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

export function authenticateByPassword(
  userName: string,
  password: string,
  config: GalaxiaConfig,
): GalaxiaUser | null {
  const user = (config.users ?? []).find((u) => u.name === userName);
  if (!user) return null;
  const hash = user.auth?.webPasswordHash;
  if (!hash) return null;
  if (!verifyPassword(password, hash)) return null;
  return user;
}

// ── Guards ─────────────────────────────────────────────────────────────────

export class ScopeError extends Error {
  constructor(public readonly user: string, public readonly projectTag: string) {
    super(`User "${user}" has no access to project "${projectTag}"`);
    this.name = 'ScopeError';
  }
}

export class OwnerOnlyError extends Error {
  constructor(public readonly user: string) {
    super(`Action restricted to owner (actor: "${user}")`);
    this.name = 'OwnerOnlyError';
  }
}

/** Throws ScopeError when the user cannot access the project. */
export function requireScope(user: GalaxiaUser, projectTag: string): void {
  if (!userCanAccess(user, projectTag)) {
    throw new ScopeError(user.name, projectTag);
  }
}

/** Throws OwnerOnlyError when the user is not an owner. */
export function requireOwner(user: GalaxiaUser): void {
  if (user.role !== 'owner') {
    throw new OwnerOnlyError(user.name);
  }
}

export function isOwner(user: GalaxiaUser): boolean {
  return user.role === 'owner';
}
