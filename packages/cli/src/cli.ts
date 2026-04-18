#!/usr/bin/env node

// GALAXIA CLI — Your AI Company in a Box
// Zero external dependencies — only Node.js built-ins + @galaxia/* workspace packages

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, openSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  resolveDataDir,
  stateFilePath,
  stateDir,
  logFilePath,
  logsDir,
  pidFilePath,
  missionsFilePath,
  knowledgeDir,
  configSearchPaths,
  loadConfig,
  updateState,
  runCycle,
  queryAudit,
  type AuditQuery,
  type DataClass,
  type RoutingAuditEntry,
} from '@galaxia/core';

// ── Constants ──────────────────────────────────────────────────────────────

const VERSION = '0.1.0';

// ── Unicode Helpers ────────────────────────────────────────────────────────

const SYM = {
  star:    '\u2728',
  check:   '\u2714',
  cross:   '\u2718',
  arrow:   '\u25B6',
  dot:     '\u2022',
  box:     '\u25A0',
  circle:  '\u25CF',
  dash:    '\u2500',
  pipe:    '\u2502',
  corner:  '\u2514',
  tee:     '\u251C',
  top_l:   '\u250C',
  top_r:   '\u2510',
  bot_l:   '\u2514',
  bot_r:   '\u2518',
  h_line:  '\u2500',
  rocket:  '\u2192',
  warn:    '\u26A0',
  info:    '\u2139',
  gear:    '\u2699',
} as const;

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  bg_cyan: '\x1b[46m',
  bg_blue: '\x1b[44m',
} as const;

function line(width = 50): string {
  return SYM.h_line.repeat(width);
}

function boxLine(content: string, width = 56): string {
  const stripped = content.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - stripped.length - 4);
  return `  ${SYM.pipe} ${content}${' '.repeat(padding)} ${SYM.pipe}`;
}

// ── Ensure Data Dirs ───────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(resolveDataDir(), { recursive: true });
  mkdirSync(stateDir(), { recursive: true });
  mkdirSync(logsDir(), { recursive: true });
  mkdirSync(knowledgeDir(), { recursive: true });
}

// ── State Helpers ──────────────────────────────────────────────────────────

interface Mission {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

function loadMissions(): Mission[] {
  const file = missionsFilePath();
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Mission[];
  } catch {
    return [];
  }
}

function saveMissions(missions: Mission[]): void {
  ensureDirs();
  writeFileSync(missionsFilePath(), JSON.stringify(missions, null, 2), 'utf-8');
}

function loadStateFile(): Record<string, unknown> {
  const file = stateFilePath();
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── System Metrics ─────────────────────────────────────────────────────────

function getSystemMetrics(): { cpu: string; ram: string; disk: string } {
  try {
    const cpu = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}' 2>/dev/null || echo '0'", { encoding: 'utf-8' }).trim();
    const ram = execSync("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}' 2>/dev/null || echo '0'", { encoding: 'utf-8' }).trim();
    const disk = execSync("df / | awk 'NR==2 {gsub(/%/,\"\"); print $5}' 2>/dev/null || echo '0'", { encoding: 'utf-8' }).trim();
    return {
      cpu: `${Math.round(parseFloat(cpu) || 0)}%`,
      ram: `${Math.round(parseFloat(ram) || 0)}%`,
      disk: `${Math.round(parseFloat(disk) || 0)}%`,
    };
  } catch {
    return { cpu: '?%', ram: '?%', disk: '?%' };
  }
}

// ── Config Helpers ─────────────────────────────────────────────────────────

function findConfigPath(): string | null {
  for (const p of configSearchPaths()) {
    if (existsSync(p)) return p;
  }
  return null;
}

function loadConfigRaw(): Record<string, unknown> {
  const configPath = findConfigPath();
  if (!configPath) return {};
  try {
    // Minimal YAML parsing for display purposes (key: value on single lines)
    const raw = readFileSync(configPath, 'utf-8');
    const result: Record<string, unknown> = {};
    let currentSection = '';
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent === 0 && trimmed.endsWith(':')) {
        currentSection = trimmed.slice(0, -1);
        result[currentSection] = {};
      } else if (indent > 0 && currentSection) {
        const match = trimmed.match(/^(\w+):\s*(.+)$/);
        if (match) {
          (result[currentSection] as Record<string, string>)[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmdInit(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('');
  console.log(`  ${C.bold}${C.cyan}${SYM.star} GALAXIA Setup ${SYM.star}${C.reset}`);
  console.log(`  ${C.dim}Your AI Company in a Box${C.reset}`);
  console.log(`  ${C.dim}${line(40)}${C.reset}`);
  console.log('');

  const name = (await rl.question(`  ${C.cyan}${SYM.arrow}${C.reset} What's your business/project name? `)) || 'My Project';
  const description = (await rl.question(`  ${C.cyan}${SYM.arrow}${C.reset} Describe it in one sentence: `)) || 'An awesome AI-powered project';
  const projectPath = (await rl.question(`  ${C.cyan}${SYM.arrow}${C.reset} Where is your project? (path, default: current dir) `)) || process.cwd();
  const groqKey = (await rl.question(`  ${C.cyan}${SYM.arrow}${C.reset} Groq API key (free at console.groq.com): `)) || '';
  const telegramToken = (await rl.question(`  ${C.cyan}${SYM.arrow}${C.reset} Telegram bot token (optional): `)) || '';
  const telegramChatId = (await rl.question(`  ${C.cyan}${SYM.arrow}${C.reset} Telegram chat ID (optional): `)) || '';

  rl.close();

  // Generate config YAML
  const projectName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  let configYaml = `# GALAXIA Configuration
# Generated by galaxia init

business:
  name: "${name}"
  description: "${description}"

llm:
  default: groq
  providers:
    groq:
      model: llama-3.3-70b-versatile
`;

  if (groqKey) {
    configYaml += `      api_key: ${groqKey}\n`;
  } else {
    configYaml += `      # api_key: gsk_xxx (or set GROQ_API_KEY env var)\n`;
  }

  configYaml += `    ollama:
      url: http://localhost:11434
      model: llama3.2
    claude:
      model: claude-sonnet-4-6
      # Only used for heavy tasks

projects:
  - name: ${projectName}
    path: ${resolve(projectPath)}

agents:
  mode: mission
  cycle_interval: 3600

notifications:
  telegram:
`;

  if (telegramToken && telegramChatId) {
    configYaml += `    enabled: true
    bot_token: ${telegramToken}
    chat_id: ${telegramChatId}
`;
  } else {
    configYaml += `    enabled: false
    # bot_token: xxx
    # chat_id: xxx
`;
  }

  configYaml += `  discord:
    enabled: false
    # webhook_url: xxx
`;

  // Write config
  writeFileSync('galaxia.yml', configYaml, 'utf-8');

  // Create data directories
  ensureDirs();
  mkdirSync(join(resolveDataDir(), 'backups'), { recursive: true });

  // Initialize empty state
  const initialStatePath = stateFilePath();
  if (!existsSync(initialStatePath)) {
    writeFileSync(initialStatePath, JSON.stringify({
      system: { cpu: '0%', ram: '0%', disk: '0%', pm2Online: '0/0' },
      projects: {},
      lastUpdated: new Date().toISOString(),
      dailyStats: { bugsFixed: 0, featuresShipped: 0 },
    }, null, 2), 'utf-8');
  }

  // Initialize empty missions
  if (!existsSync(missionsFilePath())) {
    saveMissions([]);
  }

  console.log('');
  console.log(`  ${C.green}${SYM.check} Configuration written to galaxia.yml${C.reset}`);
  console.log(`  ${C.green}${SYM.check} Data directories created at ${resolveDataDir()}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}${C.cyan}${line(44)}${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}  Welcome to GALAXIA, ${name}!${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}${line(44)}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}Next steps:${C.reset}`);
  console.log(`    ${C.dim}1.${C.reset} galaxia mission add "Your first mission"  `);
  console.log(`    ${C.dim}2.${C.reset} galaxia run                ${C.dim}# run one cycle${C.reset}`);
  console.log(`    ${C.dim}3.${C.reset} galaxia start              ${C.dim}# start daemon${C.reset}`);
  console.log(`    ${C.dim}4.${C.reset} galaxia status             ${C.dim}# check everything${C.reset}`);
  console.log('');
}

function cmdStatus(): void {
  const state = loadStateFile();
  const missions = loadMissions();
  const metrics = getSystemMetrics();
  const config = loadConfigRaw();
  const business = (config.business as Record<string, string>) || {};

  const activeMissions = missions.filter(m => m.status === 'pending' || m.status === 'in_progress').length;
  const completedMissions = missions.filter(m => m.status === 'completed').length;

  // Count knowledge entries across $dataDir/memory/projects/*/KNOWLEDGE.md
  let knowledgeCount = 0;
  const memoryProjects = join(knowledgeDir(), 'projects');
  if (existsSync(memoryProjects)) {
    try {
      for (const projName of readdirSync(memoryProjects)) {
        const kPath = join(memoryProjects, projName, 'KNOWLEDGE.md');
        if (existsSync(kPath)) {
          const content = readFileSync(kPath, 'utf-8');
          knowledgeCount += (content.match(/^## /gm) || []).length || 1;
        }
      }
    } catch { /* ignore */ }
  }

  const projects = (state.projects || {}) as Record<string, Record<string, unknown>>;
  const projectNames = Object.keys(projects);

  console.log('');
  console.log(`  ${C.bold}${C.cyan}GALAXIA${C.reset} ${C.dim}v${VERSION}${C.reset} ${C.dim}${SYM.dash}${C.reset} ${C.bold}AI Company in a Box${C.reset}`);
  if (business.name) {
    console.log(`  ${C.dim}${business.name}${business.description ? ` ${SYM.dash} ${business.description}` : ''}${C.reset}`);
  }
  console.log('');
  console.log(`  ${C.bold}System:${C.reset}  CPU ${colorMetric(metrics.cpu)} ${SYM.pipe} RAM ${colorMetric(metrics.ram)} ${SYM.pipe} Disk ${colorMetric(metrics.disk)}`);
  console.log('');

  if (projectNames.length > 0) {
    console.log(`  ${C.bold}Projects:${C.reset}`);
    for (const name of projectNames) {
      const proj = projects[name] as Record<string, unknown>;
      const status = (proj.status as string) || 'unknown';
      const lastCycle = proj.lastCycle ? timeSince(proj.lastCycle as string) : 'never';
      const backlog = (proj.backlogCount as number) || 0;
      const statusColor = status === 'healthy' ? C.green : status === 'warning' ? C.yellow : status === 'critical' ? C.red : C.dim;
      console.log(`    ${C.bold}${name}${C.reset}     ${statusColor}${status.padEnd(10)}${C.reset}${SYM.pipe} Last cycle: ${lastCycle} ${SYM.pipe} Backlog: ${backlog}`);
    }
  } else {
    console.log(`  ${C.bold}Projects:${C.reset}  ${C.dim}No projects configured yet${C.reset}`);
  }
  console.log('');

  console.log(`  ${C.bold}Agents:${C.reset}   10 built-in ${SYM.pipe} 0 custom`);
  console.log(`  ${C.bold}Missions:${C.reset} ${activeMissions} active ${SYM.pipe} ${completedMissions} completed`);
  console.log(`  ${C.bold}Knowledge:${C.reset} ${knowledgeCount} entries across ${Math.max(projectNames.length, 1)} project${projectNames.length !== 1 ? 's' : ''}`);
  console.log('');

  // Daemon status — Phase 5: show uptime, last cycle, cycle count, last decision.
  const daemonRunning = isDaemonRunning();
  const daemonState = (state.daemon as Record<string, unknown> | undefined) || {};
  if (daemonRunning) {
    console.log(`  ${C.green}${SYM.circle} Galaxia daemon: RUNNING${C.reset} (PID: ${readPid()})`);
    const startedAt = daemonState.startedAt as string | undefined;
    if (startedAt) {
      console.log(`    ${C.dim}Uptime:${C.reset}        ${formatUptime(startedAt)} ${C.dim}(since ${fmtLocalTime(startedAt)})${C.reset}`);
    }
    const lastCycle = daemonState.lastCycle as string | undefined;
    const lastCycleMs = daemonState.lastCycleMs as number | undefined;
    if (lastCycle) {
      const ms = typeof lastCycleMs === 'number' ? ` ${C.dim}(${lastCycleMs}ms)${C.reset}` : '';
      console.log(`    ${C.dim}Last cycle:${C.reset}    ${timeSince(lastCycle)}${ms}`);
    } else {
      console.log(`    ${C.dim}Last cycle:${C.reset}    ${C.dim}pending first cycle${C.reset}`);
    }
    const cycleCount = (daemonState.cycleCount as number | undefined) ?? 0;
    console.log(`    ${C.dim}Cycles run:${C.reset}    ${cycleCount}`);
    // Last routing decision from the audit log, if any.
    try {
      const configForAudit = loadConfig();
      const last = queryAudit({ limit: 1 }, configForAudit)[0];
      if (last) {
        const transportLabel = last.decision.transport ? `/${last.decision.transport}` : '';
        const okLabel = last.success ? `${C.green}ok${C.reset}` : `${C.red}fail${C.reset}`;
        console.log(
          `    ${C.dim}Last routing:${C.reset}  ${last.decision.provider}/${last.decision.model}${transportLabel} ` +
          `${C.dim}(${last.context.taskType}, ${last.context.dataClass}, ${last.latencyMs}ms, ${okLabel}${C.dim})${C.reset}`,
        );
      }
    } catch { /* audit unavailable — silent */ }
  } else {
    console.log(`  ${C.dim}${SYM.circle} Galaxia daemon: STOPPED${C.reset}  ${C.dim}${SYM.rocket} galaxia start${C.reset}`);
    const stoppedAt = daemonState.stoppedAt as string | undefined;
    const lastCycle = daemonState.lastCycle as string | undefined;
    if (stoppedAt) console.log(`    ${C.dim}Stopped:${C.reset}      ${timeSince(stoppedAt)}`);
    if (lastCycle)  console.log(`    ${C.dim}Last cycle:${C.reset}   ${timeSince(lastCycle)}`);
  }
  console.log('');
}

function formatUptime(startIso: string): string {
  const start = new Date(startIso).getTime();
  const diff = Math.max(0, Date.now() - start);
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function colorMetric(value: string): string {
  const num = parseInt(value, 10);
  if (isNaN(num)) return `${C.dim}${value}${C.reset}`;
  if (num > 80) return `${C.red}${C.bold}${value}${C.reset}`;
  if (num > 50) return `${C.yellow}${value}${C.reset}`;
  return `${C.green}${value}${C.reset}`;
}

function timeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function cmdMissionAdd(description: string): void {
  if (!description) {
    console.error(`  ${C.red}${SYM.cross} Usage: galaxia mission add "description"${C.reset}`);
    process.exit(1);
  }

  const missions = loadMissions();
  const id = `m-${Date.now().toString(36)}`;
  const mission: Mission = {
    id,
    description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  missions.push(mission);
  saveMissions(missions);

  console.log('');
  console.log(`  ${C.green}${SYM.check} Mission added${C.reset}`);
  console.log(`    ${C.bold}ID:${C.reset}   ${C.cyan}${id}${C.reset}`);
  console.log(`    ${C.bold}Task:${C.reset} ${description}`);
  console.log('');
}

function cmdMissionList(): void {
  const missions = loadMissions();

  console.log('');
  console.log(`  ${C.bold}${C.cyan}GALAXIA Missions${C.reset}  ${C.dim}(${missions.length} total)${C.reset}`);
  console.log(`  ${C.dim}${line(40)}${C.reset}`);

  if (missions.length === 0) {
    console.log(`  ${C.dim}No missions yet. Add one with: galaxia mission add "description"${C.reset}`);
    console.log('');
    return;
  }

  const statusIcon: Record<string, string> = {
    pending: `${C.yellow}${SYM.circle}${C.reset}`,
    in_progress: `${C.blue}${SYM.arrow}${C.reset}`,
    completed: `${C.green}${SYM.check}${C.reset}`,
    failed: `${C.red}${SYM.cross}${C.reset}`,
  };

  for (const m of missions) {
    const icon = statusIcon[m.status] || SYM.dot;
    const age = timeSince(m.createdAt);
    console.log(`  ${icon} ${C.bold}${m.id}${C.reset}  ${m.description}`);
    console.log(`    ${C.dim}${m.status} ${SYM.dot} created ${age}${C.reset}`);
  }
  console.log('');
}

async function cmdAgent(agentType: string, task: string): Promise<void> {
  const validAgents = ['dev', 'cicd', 'test', 'analyse', 'controle', 'veille', 'ideas', 'contenu', 'review', 'maintenance'];

  if (!agentType || !validAgents.includes(agentType)) {
    console.error(`  ${C.red}${SYM.cross} Unknown agent: ${agentType || '(none)'}${C.reset}`);
    console.log(`  ${C.dim}Available agents: ${validAgents.join(', ')}${C.reset}`);
    process.exit(1);
  }

  if (!task) {
    console.error(`  ${C.red}${SYM.cross} Usage: galaxia agent ${agentType} "task description"${C.reset}`);
    process.exit(1);
  }

  console.log('');
  console.log(`  ${C.cyan}${SYM.gear} Running agent: ${C.bold}${agentType}${C.reset}`);
  console.log(`  ${C.dim}Task: ${task}${C.reset}`);
  console.log('');

  // Try to dynamically import and run the agent
  try {
    // Dynamic imports — these packages may not be fully built yet
    const agentsMod = await import('@galaxia/agents') as unknown as {
      AgentRunner: new (config: unknown) => { runAgent(type: string, task: string): Promise<{ success: boolean; summary: string; actions: string[]; errors: string[] }> };
    };
    const configMod = await import('@galaxia/core/config') as unknown as {
      loadConfig(): unknown;
    };
    const config = configMod.loadConfig();
    const runner = new agentsMod.AgentRunner(config);
    const result = await runner.runAgent(agentType, task);
    console.log(`  ${result.success ? C.green + SYM.check : C.red + SYM.cross} ${result.summary}${C.reset}`);
    if (result.actions.length > 0) {
      console.log(`  ${C.bold}Actions:${C.reset}`);
      for (const action of result.actions) {
        console.log(`    ${SYM.dot} ${action}`);
      }
    }
    if (result.errors.length > 0) {
      console.log(`  ${C.red}Errors:${C.reset}`);
      for (const err of result.errors) {
        console.log(`    ${SYM.cross} ${err}`);
      }
    }
  } catch {
    // Agents package not fully built yet — provide helpful fallback
    console.log(`  ${C.yellow}${SYM.warn} Agent system not fully initialized.${C.reset}`);
    console.log(`  ${C.dim}The @galaxia/agents package needs to export AgentRunner.${C.reset}`);
    console.log(`  ${C.dim}Run: cd /opt/galaxia && pnpm build${C.reset}`);

    // Log the intent
    appendLog(`[agent:${agentType}] Task queued: ${task}`);
    console.log(`  ${C.green}${SYM.check} Task logged for next cycle.${C.reset}`);
  }
  console.log('');
}

function cmdLogs(args: string[] = []): void {
  const logFile = logFilePath();
  if (!existsSync(logFile)) {
    console.log(`  ${C.dim}No logs yet. Start the orchestrator with: galaxia start${C.reset}`);
    return;
  }

  // Parse flags: --since <duration>, --grep <pattern>, --tail <N>.
  let since: Date | null = null;
  let grepPattern: RegExp | null = null;
  let tailN: number | null = null;
  let follow = true;
  let showHelp = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--since' && args[i + 1]) {
      const d = parseDurationToDate(args[++i]);
      if (!d) {
        console.error(`  ${C.red}${SYM.cross} Invalid --since value. Use 30s, 15m, 2h, 1d.${C.reset}`);
        process.exit(1);
      }
      since = d;
    } else if (a === '--grep' && args[i + 1]) {
      try {
        grepPattern = new RegExp(args[++i]);
      } catch (err) {
        console.error(`  ${C.red}${SYM.cross} Invalid --grep regex: ${(err as Error).message}${C.reset}`);
        process.exit(1);
      }
    } else if (a === '--tail' && args[i + 1]) {
      tailN = parseInt(args[++i], 10);
      if (isNaN(tailN) || tailN <= 0) {
        console.error(`  ${C.red}${SYM.cross} --tail requires a positive integer.${C.reset}`);
        process.exit(1);
      }
      follow = false;
    } else if (a === '--no-follow' || a === '-n') {
      follow = false;
    } else if (a === '--help' || a === '-h') {
      showHelp = true;
    }
  }

  if (showHelp) {
    console.log('Usage: galaxia logs [--since 30m] [--grep PATTERN] [--tail N] [--no-follow]');
    return;
  }

  let content: string;
  try {
    content = readFileSync(logFile, 'utf-8');
  } catch (err) {
    console.error(`  ${C.red}${SYM.cross} Failed to read logs: ${(err as Error).message}${C.reset}`);
    return;
  }

  let lines = content.length > 0 ? content.split('\n').filter((l) => l.length > 0) : [];

  if (since) {
    const sinceMs = since.getTime();
    lines = lines.filter((l) => {
      const t = parseLogTimestamp(l);
      return t === null ? true : t >= sinceMs;
    });
  }
  if (grepPattern) {
    lines = lines.filter((l) => grepPattern!.test(l));
  }

  const defaultShow = 50;
  const sliceN = tailN ?? defaultShow;
  const shown = lines.slice(-sliceN);

  console.log('');
  const desc: string[] = [`last ${shown.length} lines`];
  if (since) desc.push(`since ${since.toISOString()}`);
  if (grepPattern) desc.push(`grep /${grepPattern.source}/`);
  console.log(`  ${C.bold}${C.cyan}GALAXIA Orchestrator Logs${C.reset}  ${C.dim}(${desc.join(', ')})${C.reset}`);
  console.log(`  ${C.dim}${line(50)}${C.reset}`);
  for (const l of shown) console.log(`  ${l}`);
  console.log('');

  if (!follow) return;

  // Follow mode: spawn `tail -F` and stream to stdout with the same grep
  // filter applied. Exit on Ctrl-C.
  console.log(`  ${C.dim}Following ${logFile} — Ctrl-C to stop${C.reset}`);
  const tailArgs = ['-n', '0', '-F', logFile];
  const child = spawn('tail', tailArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  let buffer = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.length === 0) continue;
      if (grepPattern && !grepPattern.test(line)) continue;
      if (since) {
        const t = parseLogTimestamp(line);
        if (t !== null && t < since.getTime()) continue;
      }
      process.stdout.write(`  ${line}\n`);
    }
  });
  child.on('exit', (code: number | null) => { process.exit(code ?? 0); });
  process.on('SIGINT', () => { child.kill('SIGTERM'); });
}

// Parse the timestamp prefix written by daemonLog: "[YYYY-MM-DD HH:MM:SS]".
// Also tolerates ISO-8601 timestamps written by appendLog. Returns ms since
// epoch, or null if the line has no parseable prefix (kept in output by
// default — `since` filtering can't judge unprefixed lines).
function parseLogTimestamp(line: string): number | null {
  const bracket = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/.exec(line);
  if (bracket) {
    const d = new Date(bracket[1].replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/.exec(line);
  if (iso) {
    const d = new Date(iso[1]);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

function cmdKnowledge(project?: string): void {
  // Look for KNOWLEDGE.md files under $dataDir/memory/projects/*/
  const memoryProjects = join(knowledgeDir(), 'projects');
  const files: Array<{ name: string; path: string }> = [];

  if (existsSync(memoryProjects)) {
    try {
      for (const projName of readdirSync(memoryProjects)) {
        const kPath = join(memoryProjects, projName, 'KNOWLEDGE.md');
        if (existsSync(kPath)) {
          files.push({ name: projName, path: kPath });
        }
      }
    } catch { /* ignore */ }
  }

  // Also check for KNOWLEDGE.md in project directories from config
  const configPath = findConfigPath();
  if (configPath) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const pathMatches = raw.matchAll(/path:\s*(.+)/g);
      for (const match of pathMatches) {
        const projPath = match[1].trim();
        const kPath = join(projPath, 'KNOWLEDGE.md');
        if (existsSync(kPath)) {
          const projName = projPath.split('/').pop() || projPath;
          files.push({ name: projName, path: kPath });
        }
      }
    } catch { /* ignore */ }
  }

  console.log('');
  console.log(`  ${C.bold}${C.cyan}GALAXIA Knowledge Base${C.reset}`);
  console.log(`  ${C.dim}${line(40)}${C.reset}`);

  if (files.length === 0) {
    console.log(`  ${C.dim}No knowledge entries yet.${C.reset}`);
    console.log(`  ${C.dim}Knowledge is generated automatically during orchestration cycles.${C.reset}`);
    console.log('');
    return;
  }

  for (const file of files) {
    if (project && file.name !== project) continue;

    console.log(`  ${C.bold}${SYM.box} ${file.name}${C.reset}  ${C.dim}${file.path}${C.reset}`);
    try {
      const content = readFileSync(file.path, 'utf-8');
      const lines = content.split('\n').slice(0, 20);
      for (const l of lines) {
        if (l.startsWith('## ')) {
          console.log(`    ${C.cyan}${l}${C.reset}`);
        } else if (l.startsWith('- ')) {
          console.log(`    ${C.dim}${l}${C.reset}`);
        } else if (l.trim()) {
          console.log(`    ${l}`);
        }
      }
      if (content.split('\n').length > 20) {
        console.log(`    ${C.dim}... (${content.split('\n').length - 20} more lines)${C.reset}`);
      }
    } catch { /* ignore */ }
    console.log('');
  }
}

async function cmdRun(): Promise<void> {
  console.log('');
  console.log(`  ${C.cyan}${SYM.gear} Running one orchestration cycle...${C.reset}`);
  console.log('');

  try {
    const configMod = await import('@galaxia/core/config') as unknown as {
      loadConfig(): Record<string, unknown>;
    };
    const config = configMod.loadConfig();

    // Try to import and run the orchestrator
    try {
      const orchMod = await import('@galaxia/core/orchestrator') as unknown as {
        runCycle(config: unknown): Promise<{
          duration: number;
          projects: Array<{ project: string; triage: { needsAction: boolean }; actionsDispatched: number; duration: number }>;
        }>;
      };
      const report = await orchMod.runCycle(config);
      console.log(`  ${C.green}${SYM.check} Cycle complete${C.reset} in ${report.duration}ms`);
      console.log(`  ${C.bold}Projects processed:${C.reset} ${report.projects.length}`);
      for (const p of report.projects) {
        const icon = p.triage.needsAction ? C.yellow + SYM.warn : C.green + SYM.check;
        console.log(`    ${icon} ${C.bold}${p.project}${C.reset} ${C.dim}(${p.actionsDispatched} actions, ${p.duration}ms)${C.reset}`);
      }
    } catch {
      // Orchestrator not ready — run a basic cycle
      console.log(`  ${C.yellow}${SYM.warn} Full orchestrator not built yet.${C.reset}`);
      console.log(`  ${C.dim}Running basic health check...${C.reset}`);
      console.log('');

      const metrics = getSystemMetrics();
      console.log(`  ${C.bold}System:${C.reset} CPU ${metrics.cpu} | RAM ${metrics.ram} | Disk ${metrics.disk}`);
      appendLog(`[cycle] Manual cycle: CPU=${metrics.cpu} RAM=${metrics.ram} Disk=${metrics.disk}`);
      console.log(`  ${C.green}${SYM.check} Basic cycle logged.${C.reset}`);
    }
  } catch {
    // Even config not available — minimal run
    console.log(`  ${C.yellow}${SYM.warn} Config system not built. Running minimal check.${C.reset}`);
    const metrics = getSystemMetrics();
    console.log(`  ${C.bold}System:${C.reset} CPU ${metrics.cpu} | RAM ${metrics.ram} | Disk ${metrics.disk}`);
    appendLog(`[cycle] Minimal cycle: CPU=${metrics.cpu} RAM=${metrics.ram} Disk=${metrics.disk}`);
    console.log(`  ${C.green}${SYM.check} Done.${C.reset}`);
  }
  console.log('');
}

function cmdStart(): void {
  if (isDaemonRunning()) {
    console.log(`  ${C.yellow}${SYM.warn} Daemon already running (PID: ${readPid()})${C.reset}`);
    return;
  }

  ensureDirs();

  // The daemon loop lives in this same file (see runDaemon() below) and is
  // dispatched by the hidden '__daemon' subcommand in main(). We re-spawn the
  // current CLI binary detached so the daemon can import runCycle/loadConfig
  // from @galaxia/core via the same module graph as the foreground CLI.
  const selfScript = process.argv[1];
  const logFile = logFilePath();
  const nodeBin = process.execPath;

  // Open the log file for append so the child's stdout/stderr land there.
  const logFd = openSync(logFile, 'a');

  const child: ChildProcess = spawn(nodeBin, [selfScript, '__daemon'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  child.unref();

  if (child.pid) {
    writeFileSync(pidFilePath(), String(child.pid), 'utf-8');
    // Record daemon start — used by cmdStatus for uptime.
    try {
      updateState('daemon.startedAt', new Date().toISOString(), resolveDataDir());
      updateState('daemon.pid', child.pid, resolveDataDir());
      updateState('daemon.cycleCount', 0, resolveDataDir());
    } catch { /* state write failures are non-fatal for start */ }
    appendLog(`[daemon] Started with PID ${child.pid}`);
    console.log('');
    console.log(`  ${C.green}${SYM.check} GALAXIA daemon started${C.reset} (PID: ${child.pid})`);
    console.log(`  ${C.dim}Logs: galaxia logs${C.reset}`);
    console.log(`  ${C.dim}Stop: galaxia stop${C.reset}`);
    console.log('');
  } else {
    console.error(`  ${C.red}${SYM.cross} Failed to start daemon${C.reset}`);
  }
}

// Hidden subcommand. Runs in the detached child process spawned by cmdStart.
// Executes runCycle() immediately, then on a setInterval driven by
// config.agents.cycleInterval. Guarded against overlap: if a cycle is still
// running when the next tick fires, the tick is skipped and logged.
async function runDaemon(): Promise<void> {
  const dataDir = resolveDataDir();
  const pidFile = pidFilePath(dataDir);

  // Ensure our PID reflects reality even if cmdStart raced us. (cmdStart
  // writes the PID before we boot; we refresh in case of a manual restart.)
  try { writeFileSync(pidFile, String(process.pid), 'utf-8'); } catch { /* noop */ }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    daemonLog(`[daemon] FATAL: failed to load config: ${(err as Error).message}`);
    process.exit(1);
  }

  const minIntervalSec = 60;
  const defaultIntervalSec = 3600;
  const requested = config.agents?.cycleInterval ?? defaultIntervalSec;
  // Env override, used by the Phase 5 smoke tests to exercise the overlap
  // guard with sub-minute ticks. Not documented in the user help on purpose.
  const envOverride = Number(process.env.GALAXIA_DAEMON_INTERVAL_SEC);
  const intervalSec = Number.isFinite(envOverride) && envOverride > 0
    ? envOverride
    : Math.max(minIntervalSec, requested);
  const intervalMs = intervalSec * 1000;

  daemonLog(`[daemon] Boot pid=${process.pid} interval=${intervalSec}s dataDir=${dataDir}`);
  if (!Number.isFinite(envOverride) && requested < minIntervalSec) {
    daemonLog(`[daemon] cycleInterval ${requested}s below minimum, clamped to ${minIntervalSec}s`);
  }

  let isRunning = false;
  let stopping = false;
  let cycleCount = 0;

  // Test-only: stall each cycle by N ms before running it. Used by the
  // Phase 5 overlap smoke test to force a cycle to outlive the next tick.
  const stallMs = Number(process.env.GALAXIA_DAEMON_TEST_STALL_MS) || 0;

  const runOnce = async (): Promise<void> => {
    if (isRunning) {
      daemonLog('[daemon] cycle skipped: previous still running');
      return;
    }
    if (stopping) return;
    isRunning = true;
    const start = Date.now();
    try {
      if (stallMs > 0) {
        await new Promise((r) => setTimeout(r, stallMs));
      }
      const report = await runCycle(config);
      cycleCount += 1;
      try {
        updateState('daemon.cycleCount', cycleCount, dataDir);
        updateState('daemon.lastCycle', report.timestamp, dataDir);
        updateState('daemon.lastCycleMs', report.duration, dataDir);
      } catch (stateErr) {
        daemonLog(`[daemon] state update failed: ${(stateErr as Error).message}`);
      }
      const actions = report.projects.reduce((sum, p) => sum + p.actionsDispatched, 0);
      daemonLog(`[daemon] cycle completed #${cycleCount} in ${report.duration}ms, ${report.projects.length} projects, ${actions} actions`);
    } catch (err) {
      daemonLog(`[daemon] cycle FAILED after ${Date.now() - start}ms: ${(err as Error).message}`);
    } finally {
      isRunning = false;
    }
  };

  // Kick off the first cycle immediately (don't wait for the first tick).
  void runOnce();

  const interval = setInterval(() => { void runOnce(); }, intervalMs);

  // Pilier 3 — Telegram bot runs in parallel with the cycle loop inside
  // the same daemon process. Loaded dynamically so that users who don't
  // build/install @galaxia/telegram still get a working daemon.
  let telegramBot: { stop(): Promise<void> } | null = null;
  if (config.telegram?.enabled && config.telegram?.botToken && config.telegram?.allowedChatIds?.length) {
    import('@galaxia/telegram')
      .then(async ({ startTelegramBot }) => {
        try {
          telegramBot = await startTelegramBot(config, {
            log: (msg) => daemonLog(`[telegram] ${msg}`),
          });
        } catch (err) {
          daemonLog(`[telegram] fatal: ${(err as Error).message}`);
        }
      })
      .catch((err: Error) => {
        daemonLog(`[telegram] import failed: ${err.message}`);
      });
  } else if (config.telegram?.enabled) {
    daemonLog('[telegram] enabled in config but botToken or allowedChatIds missing — skipped');
  }

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    daemonLog(`[daemon] stopping (${signal}) — waiting up to 30s for current cycle`);
    clearInterval(interval);
    if (telegramBot) {
      try { await telegramBot.stop(); } catch { /* noop */ }
    }
    const deadline = Date.now() + 30_000;
    while (isRunning && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (isRunning) {
      daemonLog('[daemon] timeout reached; exiting with cycle still in-flight');
    } else {
      daemonLog('[daemon] clean shutdown');
    }
    try { if (existsSync(pidFile)) unlinkSync(pidFile); } catch { /* noop */ }
    try { updateState('daemon.stoppedAt', new Date().toISOString(), dataDir); } catch { /* noop */ }
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT'); });
  process.on('uncaughtException', (err: Error) => {
    daemonLog(`[daemon] uncaughtException: ${err.stack || err.message}`);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
    daemonLog(`[daemon] unhandledRejection: ${msg}`);
  });
}

function daemonLog(message: string): void {
  // Timestamped single-line log: "[YYYY-MM-DD HH:MM:SS] message".
  // Writes to stdout so our parent's logFd captures it into orchestrator.log.
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const ts =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  process.stdout.write(`[${ts}] ${message}\n`);
}

function cmdStop(): void {
  const pidFile = pidFilePath();

  if (!isDaemonRunning()) {
    const stalePid = readPid();
    if (stalePid && existsSync(pidFile)) {
      try { unlinkSync(pidFile); } catch { /* noop */ }
      console.log(`  ${C.dim}Removed stale PID file (pid ${stalePid} was not alive).${C.reset}`);
    } else {
      console.log(`  ${C.dim}Daemon is not running.${C.reset}`);
    }
    return;
  }

  const pid = Number(readPid());
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.error(`  ${C.red}${SYM.cross} Failed to signal daemon: ${(err as Error).message}${C.reset}`);
    if (existsSync(pidFile)) {
      try { unlinkSync(pidFile); } catch { /* noop */ }
    }
    return;
  }

  // Poll up to 30s for graceful death, then SIGKILL.
  const deadline = Date.now() + 30_000;
  const pollMs = 200;
  const waitUntilDead = (): void => {
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0); // throws if dead
      } catch {
        return; // dead
      }
      execSync(`sleep ${pollMs / 1000}`);
    }
  };
  waitUntilDead();

  let stillAlive = false;
  try { process.kill(pid, 0); stillAlive = true; } catch { /* dead */ }

  if (stillAlive) {
    console.log(`  ${C.yellow}${SYM.warn} Daemon did not exit within 30s, sending SIGKILL${C.reset}`);
    try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
  }

  if (existsSync(pidFile)) {
    try { unlinkSync(pidFile); } catch { /* noop */ }
  }
  appendLog(`[daemon] Stopped (PID ${pid})`);
  console.log('');
  console.log(`  ${C.green}${SYM.check} GALAXIA daemon stopped${C.reset} (PID: ${pid})`);
  console.log('');
}

function cmdVersion(): void {
  console.log(`  ${C.bold}${C.cyan}GALAXIA${C.reset} v${VERSION}`);
}

function cmdHelp(): void {
  console.log('');
  console.log(`  ${C.bold}${C.cyan}GALAXIA${C.reset} ${C.dim}v${VERSION}${C.reset} ${SYM.dash} ${C.bold}Your AI Company in a Box${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}Usage:${C.reset}  galaxia <command> [options]`);
  console.log('');
  console.log(`  ${C.bold}Commands:${C.reset}`);
  console.log(`    ${C.cyan}init${C.reset}                          Interactive setup wizard`);
  console.log(`    ${C.cyan}status${C.reset}                        System metrics & project statuses`);
  console.log(`    ${C.cyan}mission add${C.reset} ${C.dim}"description"${C.reset}     Add a new mission`);
  console.log(`    ${C.cyan}mission list${C.reset}                   List all missions`);
  console.log(`    ${C.cyan}agent${C.reset} ${C.dim}<type> "task"${C.reset}            Run a specific agent`);
  console.log(`    ${C.cyan}run${C.reset}                           Run one orchestration cycle`);
  console.log(`    ${C.cyan}start${C.reset}                         Start the orchestrator daemon`);
  console.log(`    ${C.cyan}stop${C.reset}                          Stop the daemon`);
  console.log(`    ${C.cyan}logs${C.reset}                          Tail orchestrator logs`);
  console.log(`    ${C.cyan}knowledge${C.reset} ${C.dim}[project]${C.reset}            Show knowledge base`);
  console.log(`    ${C.cyan}routing audit${C.reset} ${C.dim}[filters]${C.reset}         Show recent LLM routing decisions`);
  console.log(`    ${C.cyan}version${C.reset}                       Print version`);
  console.log(`    ${C.cyan}help${C.reset}                          Show this help`);
  console.log('');
  console.log(`  ${C.bold}Agent types:${C.reset}`);
  console.log(`    ${C.dim}dev, cicd, test, analyse, controle, veille, ideas, contenu, review, maintenance${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}Examples:${C.reset}`);
  console.log(`    ${C.dim}$ galaxia init${C.reset}`);
  console.log(`    ${C.dim}$ galaxia mission add "Improve landing page conversion"${C.reset}`);
  console.log(`    ${C.dim}$ galaxia agent dev "Add dark mode support"${C.reset}`);
  console.log(`    ${C.dim}$ galaxia run${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}Documentation: https://github.com/Jeffchoux/galaxia${C.reset}`);
  console.log('');
}

// ── Daemon Helpers ─────────────────────────────────────────────────────────

function readPid(): string {
  const pidFile = pidFilePath();
  if (!existsSync(pidFile)) return '';
  return readFileSync(pidFile, 'utf-8').trim();
}

function isDaemonRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0); // signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}

function appendLog(message: string): void {
  ensureDirs();
  const ts = new Date().toISOString();
  const logFile = logFilePath();
  try {
    writeFileSync(logFile, `${existsSync(logFile) ? readFileSync(logFile, 'utf-8') : ''}${ts} ${message}\n`, 'utf-8');
  } catch { /* ignore */ }
}

// ── Routing audit ──────────────────────────────────────────────────────────

function parseDurationToDate(s: string): Date | null {
  const m = /^(\d+)([smhd])$/.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() - n * mult[m[2]]);
}

function padEnd(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s + ' '.repeat(n - s.length);
}

function fmtLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${mo}-${da} ${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}

function cmdRoutingAudit(args: string[]): void {
  const query: AuditQuery = { limit: 20 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--since' && args[i + 1]) {
      const d = parseDurationToDate(args[++i]);
      if (!d) {
        console.error(`  ${C.red}${SYM.cross} Invalid --since value. Use 5m, 2h, 1d, 30s.${C.reset}`);
        process.exit(1);
      }
      query.since = d;
    } else if (a === '--project' && args[i + 1]) {
      query.projectTag = args[++i];
    } else if (a === '--class' && args[i + 1]) {
      query.dataClass = args[++i] as DataClass;
    } else if (a === '--rule' && args[i + 1]) {
      query.ruleName = args[++i];
    } else if (a === '--limit' && args[i + 1]) {
      query.limit = parseInt(args[++i], 10) || 20;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: galaxia routing audit [--since 1h] [--project NAME] [--class CLASS] [--rule NAME] [--limit N]');
      return;
    }
  }

  const config = loadConfig();
  const entries = queryAudit(query, config);

  console.log('');
  console.log(`  ${C.bold}${C.cyan}GALAXIA routing audit${C.reset}  ${C.dim}(${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})${C.reset}`);
  console.log(`  ${C.dim}${line(90)}${C.reset}`);

  if (entries.length === 0) {
    console.log(`  ${C.dim}No entries match this filter.${C.reset}`);
    console.log('');
    return;
  }

  // Header
  console.log(
    '  ' +
    C.bold +
    padEnd('WHEN', 16) +
    padEnd('RULE', 26) +
    padEnd('CLASS', 14) +
    padEnd('TASK', 16) +
    padEnd('PROVIDER', 20) +
    padEnd('ms', 6) +
    'OK' +
    C.reset,
  );

  for (const e of entries) {
    printAuditRow(e);
  }
  console.log('');
}

function printAuditRow(e: RoutingAuditEntry): void {
  const okCol = e.success ? `${C.green}${SYM.check}${C.reset}` : `${C.red}${SYM.cross}${C.reset}`;
  const when = fmtLocalTime(e.timestamp);
  const rule = e.decision.matchedRule;
  const cls = String(e.context.dataClass);
  const task = String(e.context.taskType);
  const prov = `${e.decision.provider}/${e.decision.model}`;
  const ms = String(e.latencyMs);
  console.log(
    '  ' +
    padEnd(when, 16) +
    padEnd(rule, 26) +
    padEnd(cls, 14) +
    padEnd(task, 16) +
    padEnd(prov, 20) +
    padEnd(ms, 6) +
    okCol,
  );
  if (e.decision.fallbackTried.length > 0) {
    console.log(`    ${C.dim}fallback tried: ${e.decision.fallbackTried.join(' → ')}${C.reset}`);
  }
  if (!e.success && e.errorMessage) {
    console.log(`    ${C.dim}${C.red}error: ${e.errorMessage}${C.reset}`);
  }
}

// ── Main Router ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'init':
      await cmdInit();
      break;

    case 'status':
      cmdStatus();
      break;

    case 'mission': {
      const subcommand = args[1];
      if (subcommand === 'add') {
        const description = args.slice(2).join(' ');
        cmdMissionAdd(description);
      } else if (subcommand === 'list' || !subcommand) {
        cmdMissionList();
      } else {
        console.error(`  ${C.red}${SYM.cross} Unknown mission subcommand: ${subcommand}${C.reset}`);
        console.log(`  ${C.dim}Usage: galaxia mission add "description" | galaxia mission list${C.reset}`);
      }
      break;
    }

    case 'agent': {
      const agentType = args[1];
      const task = args.slice(2).join(' ');
      await cmdAgent(agentType, task);
      break;
    }

    case 'logs':
      cmdLogs(args.slice(1));
      break;

    case 'knowledge':
      cmdKnowledge(args[1]);
      break;

    case 'routing': {
      const subcommand = args[1];
      if (subcommand === 'audit') {
        cmdRoutingAudit(args.slice(2));
      } else {
        console.error(`  ${C.red}${SYM.cross} Unknown routing subcommand: ${subcommand ?? '(none)'}${C.reset}`);
        console.log(`  ${C.dim}Usage: galaxia routing audit [--since 1h] [--project NAME] [--class CLASS] [--rule NAME] [--limit N]${C.reset}`);
      }
      break;
    }

    case 'run':
      await cmdRun();
      break;

    case 'start':
      cmdStart();
      break;

    case 'stop':
      cmdStop();
      break;

    // Hidden entry used by cmdStart's detached child. Not documented in help.
    case '__daemon':
      await runDaemon();
      break;

    case 'version':
    case '--version':
    case '-v':
      cmdVersion();
      break;

    case 'help':
    case '--help':
    case '-h':
      cmdHelp();
      break;

    default:
      console.error(`  ${C.red}${SYM.cross} Unknown command: ${command}${C.reset}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`  ${C.red}${SYM.cross} Fatal: ${(err as Error).message}${C.reset}`);
  process.exit(1);
});
