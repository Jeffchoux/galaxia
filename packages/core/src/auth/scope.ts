// GALAXIA Core — scope check for Phase 7 multi-user.
//
// `userCanAccess(user, projectTag)` is the single primitive every consumer
// (Telegram handlers, web API, CLI) should call before letting a user see
// or touch a project. Wildcard `'*'` in `user.scope` grants access to
// every project; otherwise an exact-name match is required.
//
// Decision logged per-call would be noisy — audit happens at higher level
// (router) when a request is rejected, not per scope check.

import type { GalaxiaUser } from '../types.js';

export function userCanAccess(user: GalaxiaUser, projectTag: string): boolean {
  if (!user.scope || user.scope.length === 0) return false;
  if (user.scope.includes('*')) return true;
  return user.scope.includes(projectTag);
}
