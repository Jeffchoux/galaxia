// GALAXIA Orchestrator — port of galaxia-orchestrator.sh
// The brain: collect metrics, triage projects, dispatch agents, update state

import { execSync } from 'node:child_process';
import type {
  GalaxiaConfig,
  SystemMetrics,
  TriageResult,
  ProjectCycleResult,
  CycleReport,
  AgentAction,
} from './types.js';
import { callLLM } from './llm-router.js';
import { loadState, updateState } from './state.js';
import { addKnowledge } from './knowledge.js';
import { notify } from './notifications.js';

// ── Phase 1: System Metrics ──────────────────────────────────

function shellExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 15_000 }).trim();
  } catch {
    return 'unknown';
  }
}

export function collectMetrics(): SystemMetrics {
  const cpu = shellExec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d. -f1");
  const ram = shellExec("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}'");
  const disk = shellExec("df -h / | awk 'NR==2 {print $5}'");

  // PM2 status
  let pm2Online = '0/0';
  try {
    const pm2Raw = shellExec('pm2 jlist');
    const pm2List = JSON.parse(pm2Raw) as Array<{ pm2_env?: { status?: string } }>;
    const online = pm2List.filter((p) => p.pm2_env?.status === 'online').length;
    pm2Online = `${online}/${pm2List.length}`;
  } catch { /* pm2 not available */ }

  return {
    cpu: cpu !== 'unknown' ? `${cpu}%` : 'unknown',
    ram: ram !== 'unknown' ? `${ram}%` : 'unknown',
    disk,
    pm2Online,
  };
}

// ── Phase 2: Project Triage ──────────────────────────────────

const TRIAGE_PROMPT_TEMPLATE = `You are GALAXIA, an AI agent orchestrator. Analyze this project and decide what actions are needed.

Project: {{name}}
Path: {{path}}
PM2 Status: {{pm2Status}}
System: CPU={{cpu}}, RAM={{ram}}, Disk={{disk}}

Recent state:
{{state}}

Respond in JSON only (no markdown, no explanation):
{
  "needsAction": true/false,
  "severity": "none|low|medium|high|critical",
  "actions": [{"type": "dev|cicd|test|analyse|controle", "task": "description", "priority": 1-5}],
  "summary": "one line summary",
  "backlogAdditions": ["optional new backlog items"]
}`;

function buildTriagePrompt(
  projectName: string,
  projectPath: string,
  pm2Status: string,
  metrics: SystemMetrics,
  state: string,
): string {
  return TRIAGE_PROMPT_TEMPLATE
    .replace('{{name}}', projectName)
    .replace('{{path}}', projectPath)
    .replace('{{pm2Status}}', pm2Status)
    .replace('{{cpu}}', metrics.cpu)
    .replace('{{ram}}', metrics.ram)
    .replace('{{disk}}', metrics.disk)
    .replace('{{state}}', state);
}

function getPm2Status(pm2Name?: string): string {
  if (!pm2Name) return 'not managed';
  try {
    const raw = shellExec(`pm2 describe ${pm2Name} 2>/dev/null`);
    const statusMatch = raw.match(/status\s+│\s+(\w+)/);
    return statusMatch ? statusMatch[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function triageProject(
  projectName: string,
  projectPath: string,
  pm2Name: string | undefined,
  metrics: SystemMetrics,
  config: GalaxiaConfig,
): Promise<TriageResult> {
  const pm2Status = getPm2Status(pm2Name);
  const state = loadState(config.dataDir);
  const projectState = state.projects[projectName];
  const stateStr = projectState ? JSON.stringify(projectState, null, 2) : 'No previous state';

  const prompt = buildTriagePrompt(projectName, projectPath, pm2Status, metrics, stateStr);

  try {
    const { text: response } = await callLLM(
      {
        dataClass: 'professional',
        taskType: 'triage',
        projectTag: projectName,
      },
      prompt,
      config,
    );

    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[orchestrator] No JSON in triage response for ${projectName}`);
      return { needsAction: false, severity: 'none', actions: [], summary: 'Triage parse error', backlogAdditions: [] };
    }

    return JSON.parse(jsonMatch[0]) as TriageResult;
  } catch (err) {
    console.error(`[orchestrator] Triage failed for ${projectName}:`, (err as Error).message);
    return { needsAction: false, severity: 'none', actions: [], summary: 'Triage error', backlogAdditions: [] };
  }
}

// ── Phase 3: Dispatch Agents ─────────────────────────────────

async function dispatchAction(action: AgentAction, projectName: string): Promise<void> {
  const scriptPath = `/opt/agents/${action.type}/run.sh`;
  console.error(`[orchestrator] Dispatching ${action.type} for ${projectName}: ${action.task}`);

  try {
    shellExec(`bash ${scriptPath} ${JSON.stringify(action.task)}`);
  } catch (err) {
    console.error(`[orchestrator] Agent ${action.type} failed:`, (err as Error).message);
  }
}

// ── Phase 4: Full Cycle ──────────────────────────────────────

export async function runCycle(config: GalaxiaConfig): Promise<CycleReport> {
  const cycleStart = Date.now();
  const timestamp = new Date().toISOString();

  console.error(`[orchestrator] === Cycle start: ${timestamp} ===`);

  // Phase 1: Collect metrics
  const metrics = collectMetrics();
  updateState('system', metrics, config.dataDir);
  console.error(`[orchestrator] System: CPU=${metrics.cpu} RAM=${metrics.ram} Disk=${metrics.disk} PM2=${metrics.pm2Online}`);

  // Phase 2+3: Triage and dispatch for each project
  const results: ProjectCycleResult[] = [];

  for (const project of config.projects) {
    const projectStart = Date.now();

    // CPU guard: skip if system is overloaded
    const cpuNum = parseInt(metrics.cpu, 10);
    if (!isNaN(cpuNum) && cpuNum > 80) {
      console.error(`[orchestrator] CPU ${metrics.cpu} > 80%, skipping ${project.name}`);
      results.push({
        project: project.name,
        triage: { needsAction: false, severity: 'none', actions: [], summary: 'Skipped (CPU high)', backlogAdditions: [] },
        actionsDispatched: 0,
        duration: Date.now() - projectStart,
      });
      continue;
    }

    const triage = await triageProject(
      project.name,
      project.path,
      project.pm2Name,
      metrics,
      config,
    );

    let dispatched = 0;
    if (triage.needsAction) {
      // Sort by priority (1 = highest)
      const sorted = [...triage.actions].sort((a, b) => a.priority - b.priority);
      for (const action of sorted) {
        if (config.agents.enabled.includes(action.type)) {
          await dispatchAction(action, project.name);
          dispatched++;
        }
      }
    }

    // Update project state
    updateState(`projects.${project.name}.status`, triage.severity === 'none' ? 'healthy' : triage.severity === 'critical' ? 'critical' : 'warning', config.dataDir);
    updateState(`projects.${project.name}.lastCycle`, timestamp, config.dataDir);
    updateState(`projects.${project.name}.backlogCount`, triage.backlogAdditions.length, config.dataDir);
    updateState(`projects.${project.name}.nextPriority`, triage.actions[0]?.task ?? 'none', config.dataDir);

    // Log knowledge if there were actions
    if (triage.needsAction && triage.summary) {
      addKnowledge(project.name, {
        date: timestamp.split('T')[0],
        category: 'orchestrator',
        content: triage.summary,
        project: project.name,
      }, config.dataDir);
    }

    results.push({
      project: project.name,
      triage,
      actionsDispatched: dispatched,
      duration: Date.now() - projectStart,
    });
  }

  // Phase 4: Notifications
  const actionCount = results.reduce((sum, r) => sum + r.actionsDispatched, 0);
  const criticalProjects = results.filter((r) => r.triage.severity === 'critical');

  if (criticalProjects.length > 0) {
    const critNames = criticalProjects.map((r) => r.project).join(', ');
    await notify(`🚨 *GALAXIA* — Critical: ${critNames}\n${criticalProjects.map((r) => r.triage.summary).join('\n')}`, config);
  } else if (actionCount > 0) {
    await notify(`⚡ *GALAXIA* — Cycle done: ${actionCount} actions across ${results.length} projects`, config);
  }

  const report: CycleReport = {
    timestamp,
    projects: results,
    systemMetrics: metrics,
    duration: Date.now() - cycleStart,
  };

  console.error(`[orchestrator] === Cycle end: ${report.duration}ms, ${actionCount} actions ===`);
  return report;
}
