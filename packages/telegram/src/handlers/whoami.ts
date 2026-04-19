// /whoami — introspection of the authenticated user. Returns name, role,
// and the scope of projects they can see. Safe for any authenticated user
// to call (no sensitive data beyond what they already have).

import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

export async function handleWhoami(ctx: CommandContext): Promise<void> {
  const u = ctx.currentUser;
  const scope = u.scope.length === 0 ? '(vide)' : u.scope.join(', ');
  const lines = [
    '*Who am I*',
    `Name: \`${escapeMd2(u.name)}\``,
    `Role: \`${escapeMd2(u.role)}\``,
    `Scope: \`${escapeMd2(scope)}\``,
  ];
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
