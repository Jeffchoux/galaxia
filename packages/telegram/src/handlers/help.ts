// /help — lists every public command. Used as the default fallback when
// the router sees an unknown /command as well.

import type { CommandContext } from '../types.js';
import { escapeMd2 } from '../format.js';

const COMMANDS: Array<[string, string]> = [
  ['/status',                         'État du daemon (running, uptime, cycles)'],
  ['/projects',                       'Liste des projets avec leur santé'],
  ['/project <name>',                 'Détail d\'un projet : status, knowledge, backlog'],
  ['/agent <type> "<task>"',          'Dispatcher un agent (dev, review, veille, …)'],
  ['/plan <type> "<task>"',           'Planifier une action (dry-run + confirmation avant apply)'],
  ['/objective <project> "<text>"',   'Ajouter un objectif au GM d\'un projet'],
  ['/gm <project> [pause|resume]',    'Voir / piloter le GM d\'un projet'],
  ['/worldseed <question>',           'Consulter l\'AGI Worldseed (owner, fallback LLM si indisponible)'],
  ['/watch <url ou texte>',           'Envoyer une info au Watcher pour analyse (owner)'],
  ['/mission add "<desc>"',           'Ajouter une mission'],
  ['/missions',                       'Lister les missions actives'],
  ['/audit [N]',                      'Dernières N décisions de routage (défaut 10)'],
  ['/logs [N]',                       'N dernières lignes du daemon (défaut 20)'],
  ['/whoami',                         'Identité / rôle / scope de l\'utilisateur courant'],
  ['/discover',                       'GitHub Discovery : liste les repos et propose de les intégrer (owner-only)'],
  ['/help',                           'Afficher cette aide'],
  ['<texte libre>',                   'Conversation — envoyé au LLM avec dataClass=personal'],
];

export async function handleHelp(ctx: CommandContext): Promise<void> {
  const lines = ['*Galaxia — commandes disponibles*', ''];
  for (const [cmd, desc] of COMMANDS) {
    lines.push(`• \`${cmd.replace(/`/g, '\\`')}\` — ${escapeMd2(desc)}`);
  }
  await ctx.client.sendMessage(ctx.chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
