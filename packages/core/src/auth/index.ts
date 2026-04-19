// GALAXIA Core — auth barrel.

export { userCanAccess } from './scope.js';
export {
  findUserByTelegramChatId,
  authenticateUser,
  authenticateByPassword,
  hashPassword,
  verifyPassword,
  requireScope,
  requireOwner,
  isOwner,
  ScopeError,
  OwnerOnlyError,
} from './auth.js';
