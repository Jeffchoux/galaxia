// GALAXIA LLM Router — ported from /opt/agents/shared/llm-router.sh and
// extended with the Pilier 4.bis routing doctrine.
//
// Two public entry points:
//   - callLLM(ctx, prompt, config): context-aware routing (recommended).
//     Matches config.routing.rules, logs an audit entry, enforces
//     strictLocalOnly for confidential/secret data.
//   - callLLMByTier(tier, prompt, config): legacy tier-only router, kept as
//     an alias so the orchestrator and any existing caller keep working
//     unchanged until Phase 3.1 migrates them.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { GalaxiaConfig, LLMTier, LLMProvider, LLMProviderConfig } from './types.js';
import type { RoutingContext, RoutingDecision, RoutingAuditEntry } from './routing/types.js';
import { decide } from './routing/engine.js';
import { logRouting } from './routing/audit.js';
import { claudeMaxHeartbeat } from './interactive-guard.js';
import {
  isCooledDown,
  markCooldown,
  markSuccess,
  tierKey as budgetTierKey,
  classifyErrorForCooldown,
} from './llm-budget/store.js';

type ClaudeTransport = 'cli' | 'http';

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface OllamaResponse {
  response?: string;
  error?: string;
}

async function callGroq(prompt: string, config: LLMProviderConfig): Promise<string> {
  const apiKey = config.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GroqResponse;
  if (data.error) throw new Error(`Groq: ${data.error.message}`);
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOllama(prompt: string, config: LLMProviderConfig): Promise<string> {
  const url = config.url || 'http://localhost:11434';

  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as OllamaResponse;
  if (data.error) throw new Error(`Ollama: ${data.error}`);
  return data.response ?? '';
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: { type?: string; message?: string };
}

// Claude dual transport — CLI first (Claude Max subscription quota), HTTP
// fallback (billed per token via api.anthropic.com).
// Valid model IDs (2026-04): claude-sonnet-4-5-20250929 (default),
// claude-opus-4-20250514, claude-haiku-4-5-20251001. The CLI also accepts
// short aliases: 'sonnet', 'opus', 'haiku'.

// Anthropic HTTP API — DÉSACTIVÉ PAR POLITIQUE JEFF 2026-04-20.
// Galaxia consomme Claude uniquement via la CLI locale (abonnement Max),
// jamais l'API payante au token. Cette fonction throw immédiatement pour
// empêcher toute régression (fallback auto, nouvelle feature, etc).
// Pour ré-activer : commenter le throw (mais discuter avec Jeff avant).
async function callClaudeHTTP(_prompt: string, _config: LLMProviderConfig): Promise<string> {
  throw new Error(
    'Claude HTTP API désactivée par policy Jeff 2026-04-20 : abonnement Max uniquement, jamais d\'API burn. ' +
    'Si Claude CLI échoue (credit/quota/rate), le router cascade vers Groq (light) — pas vers HTTP. ' +
    'Pour ré-activer l\'API : packages/core/src/llm-router.ts callClaudeHTTP.',
  );
}

// Local `claude` CLI (Claude Code). Draws from the Claude Max subscription
// quota instead of the per-token API balance. Prompt is piped via stdin to
// avoid ARG_MAX limits on long prompts. Resolved via PATH so `transport:
// 'cli'` remains a no-op on hosts where the CLI is not installed (we catch
// ENOENT and surface it to the dual-transport wrapper for HTTP fallback).
async function callClaudeCLI(prompt: string, config: LLMProviderConfig): Promise<string> {
  const timeoutMs = config.timeoutMs ?? 60_000;
  const model = config.model || 'sonnet';

  return new Promise<string>((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', model], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* noop */ }
      settle(() => reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });

    child.on('error', (err: NodeJS.ErrnoException) => {
      const hint = err.code === 'ENOENT' ? ' (binary not found on PATH)' : '';
      settle(() => reject(new Error(`Claude CLI spawn failed: ${err.message}${hint}`)));
    });

    child.on('close', (code: number | null) => {
      settle(() => {
        if (code !== 0) {
          const msg = stderr.trim() || stdout.trim() || `exit code ${code}`;
          reject(new Error(`Claude CLI exited non-zero: ${msg}`));
          return;
        }
        resolve(stdout.trim());
      });
    });

    child.stdin.on('error', (err: Error) => {
      settle(() => reject(new Error(`Claude CLI stdin error: ${err.message}`)));
    });
    child.stdin.end(prompt, 'utf8');
  });
}

// Dual-transport entry: tries the CLI first (unless the caller opted out),
// falls back to HTTP on any CLI failure (missing binary, auth, timeout,
// non-zero exit). Returns the transport that actually served the response
// so callLLM can stamp it on the routing audit entry.
async function callClaude(
  prompt: string,
  config: LLMProviderConfig,
): Promise<{ text: string; transport: ClaudeTransport }> {
  // Policy Jeff 2026-04-20 : CLI uniquement, jamais HTTP API.
  // Si CLI échoue → on throw et le router externe cascade vers light (Groq).
  const text = await callClaudeCLI(prompt, config);
  return { text, transport: 'cli' };
}

// Thin adapter so the legacy tier-only router (callLLMByTier) and the
// PROVIDER_FN dispatch table keep a uniform Promise<string> signature. The
// context-aware path (invokeProvider) bypasses this and reads transport
// directly from callClaude.
async function callClaudeString(prompt: string, config: LLMProviderConfig): Promise<string> {
  const { text } = await callClaude(prompt, config);
  return text;
}

async function callOpenAI(prompt: string, config: LLMProviderConfig): Promise<string> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = config.url || 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GroqResponse; // same shape
  return data.choices?.[0]?.message?.content ?? '';
}

type ProviderFn = (prompt: string, config: LLMProviderConfig) => Promise<string>;

const PROVIDER_FN: Record<string, ProviderFn> = {
  groq: callGroq,
  ollama: callOllama,
  claude: callClaudeString,
  openai: callOpenAI,
};

// ── Tier-only router (legacy, kept as compat alias) ────────────────────────
// Pre-Phase-3 callers use this. Fallback chain is intentionally conservative:
// light → local → heavy. Never fallback INTO local from a remote tier (that
// would be fine) or FROM local to remote if the caller meant local only
// (they should use callLLM(ctx) for that — this function makes no
// confidentiality promise).

const FALLBACK_CHAIN: LLMTier[] = ['light', 'local', 'heavy'];

/**
 * @deprecated Use `callLLM(ctx, prompt, config)` instead. Kept for backward
 * compatibility with external plugins and user scripts that predate the
 * Pilier 4.bis context-aware router. All internal call-sites (orchestrator
 * and BaseAgent) migrated in Phase 4.
 */
export async function callLLMByTier(
  tier: LLMTier,
  prompt: string,
  config: GalaxiaConfig,
): Promise<string> {
  const providerConfig = config.llm[tier];
  const fn = PROVIDER_FN[providerConfig.provider];
  if (!fn) throw new Error(`Unknown LLM provider: ${providerConfig.provider}`);

  try {
    return await fn(prompt, providerConfig);
  } catch (err) {
    console.error(`[llm-router] ${tier} (${providerConfig.provider}) failed:`, (err as Error).message);
  }

  for (const fallbackTier of FALLBACK_CHAIN) {
    if (fallbackTier === tier) continue;
    const fallbackConfig = config.llm[fallbackTier];
    const fallbackFn = PROVIDER_FN[fallbackConfig.provider];
    if (!fallbackFn) continue;
    try {
      console.error(`[llm-router] Falling back to ${fallbackTier} (${fallbackConfig.provider})`);
      return await fallbackFn(prompt, fallbackConfig);
    } catch (fallbackErr) {
      console.error(`[llm-router] Fallback ${fallbackTier} also failed:`, (fallbackErr as Error).message);
    }
  }
  throw new Error(`[llm-router] All providers failed for tier "${tier}"`);
}

// ── Context-aware router (Phase 3, current API) ────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

interface CallResult {
  text: string;
  decision: RoutingDecision;
}

async function invokeProvider(
  provider: LLMProvider,
  model: string,
  tier: LLMTier,
  prompt: string,
  config: GalaxiaConfig,
): Promise<{ text: string; transport: ClaudeTransport | null }> {
  // Use the tier's provider config as base (api keys, urls, transport prefs)
  // but override the model with whatever the routing decision picked.
  const baseCfg = config.llm[tier];
  const cfg: LLMProviderConfig = { ...baseCfg, provider, model };

  if (provider === 'claude') {
    return callClaude(prompt, cfg);
  }

  const fn = PROVIDER_FN[provider];
  if (!fn) throw new Error(`Unknown LLM provider: ${provider}`);
  const text = await fn(prompt, cfg);
  return { text, transport: null };
}

/**
 * Context-aware LLM call. Matches config.routing.rules against ctx, calls
 * the selected provider, logs an audit entry, and enforces confidentiality
 * constraints.
 *
 * Legacy overload: callLLM(tier, prompt, config) delegates to callLLMByTier
 * so pre-Phase-3 callers (orchestrator, base-agent) keep working unchanged
 * until Phase 3.1 migrates them to the context-aware form.
 */
export function callLLM(
  tier: LLMTier,
  prompt: string,
  config: GalaxiaConfig,
): Promise<string>;
export function callLLM(
  ctx: RoutingContext,
  prompt: string,
  config: GalaxiaConfig,
): Promise<CallResult>;
export async function callLLM(
  tierOrCtx: LLMTier | RoutingContext,
  prompt: string,
  config: GalaxiaConfig,
): Promise<string | CallResult> {
  if (typeof tierOrCtx === 'string') {
    return callLLMByTier(tierOrCtx, prompt, config);
  }
  const ctx = tierOrCtx;
  const decision = decide(ctx, config);

  // Interactive-session guard : si la décision appelle Claude tier heavy
  // MAIS Jeff est actif en Claude Code CLI (heartbeat file < 5min),
  // on remap vers le tier 'light' (Groq). Skippé quand
  // ctx.bypassInteractiveGuard=true (dashboard chat veut Max même si
  // l'utilisateur est actif — parce que L'UTILISATEUR EST JEFF).
  //
  // Règle Jeff 2026-04-19 : le guard ne demote PAS les tâches de code
  // (code-gen / code-review). Quand un agent code un projet, c'est
  // Claude Opus 4.7 obligatoirement, peu importe si Jeff est en session.
  const isCodeTask = ctx.taskType === 'code-gen' || ctx.taskType === 'code-review';
  if (!ctx.bypassInteractiveGuard && !isCodeTask && decision.tier === 'heavy' && decision.provider === 'claude') {
    const hb = claudeMaxHeartbeat();
    if (hb.busy) {
      const lightCfg = config.llm.light;
      decision.tier = 'light';
      decision.provider = lightCfg.provider;
      decision.model = lightCfg.model;
      decision.matchedRule = `${decision.matchedRule} + interactive-guard`;
      decision.reason = `${decision.reason} | overridden by claude-max-interactive-guard (heartbeat age=${Math.round((hb.ageMs ?? 0) / 1000)}s)`;
    }
  }

  // MVP D.3 — cooldown-aware demote. Si le tier sélectionné est en
  // cooldown (quota cramé récent), on descend la pyramide avant même
  // de tenter. Évite les 429/credit-low en boucle qui polluent les logs.
  const primaryKey = budgetTierKey(decision.tier, decision.provider, decision.model);
  if (isCooledDown(config.dataDir, primaryKey) && !decision.forbidFallback) {
    // Descendre : heavy -> medium -> light -> local
    const descendChain: LLMTier[] = decision.tier === 'heavy' ? ['medium', 'light', 'local']
      : decision.tier === 'medium' ? ['light', 'local']
      : decision.tier === 'light' ? ['local']
      : [];
    for (const alt of descendChain) {
      const altCfg = config.llm[alt];
      const altKey = budgetTierKey(alt, altCfg.provider, altCfg.model);
      if (!isCooledDown(config.dataDir, altKey)) {
        decision.matchedRule = `${decision.matchedRule} + cooled-down-demote`;
        decision.reason = `${decision.reason} | ${decision.tier} in cooldown, demoted to ${alt}`;
        decision.tier = alt;
        decision.provider = altCfg.provider;
        decision.model = altCfg.model;
        break;
      }
    }
  }

  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const promptHash = sha256(prompt);
  const promptLength = prompt.length;

  const writeAudit = (success: boolean, errorMessage: string | undefined) => {
    const entry: RoutingAuditEntry = {
      timestamp,
      context: ctx,
      decision,
      promptHash,
      promptLength,
      success,
      latencyMs: Date.now() - startedAt,
      errorMessage,
    };
    logRouting(entry, config);
  };

  // Helper : détecter et enregistrer un cooldown si l'erreur est un
  // rate-limit / credit-low. Skippe sinon (erreurs techniques, etc).
  const recordCooldown = (tier: LLMTier, provider: LLMProvider, model: string, err: Error): void => {
    const cd = classifyErrorForCooldown(err.message);
    if (cd) {
      const key = budgetTierKey(tier, provider, model);
      markCooldown(config.dataDir, key, cd.durationMs, err.message);
      console.error(`[llm-router] cooldown ${tier} (${provider}/${model}) for ${Math.round(cd.durationMs / 1000)}s : ${cd.reason}`);
    }
  };

  // Primary attempt
  try {
    const { text, transport } = await invokeProvider(decision.provider, decision.model, decision.tier, prompt, config);
    decision.transport = transport;
    markSuccess(config.dataDir, budgetTierKey(decision.tier, decision.provider, decision.model));
    writeAudit(true, undefined);
    return { text, decision };
  } catch (primaryErr) {
    const primaryMsg = (primaryErr as Error).message;
    console.error(`[llm-router] primary ${decision.provider}(${decision.model}) failed: ${primaryMsg}`);
    recordCooldown(decision.tier, decision.provider, decision.model, primaryErr as Error);

    if (decision.forbidFallback) {
      writeAudit(false, primaryMsg);
      throw new Error(
        `[llm-router] refuse-to-fallback: rule='${decision.matchedRule}' ` +
        `forbade fallback for ctx=${JSON.stringify(ctx)} (${decision.reason}). ` +
        `Primary error: ${primaryMsg}`,
      );
    }

    // Fallback chain — skip tiers en cooldown + skip celui qui vient
    // de cramer (déjà primaire).
    for (const fbTier of FALLBACK_CHAIN) {
      if (fbTier === decision.tier) continue;
      const fbCfg = config.llm[fbTier];
      if (!PROVIDER_FN[fbCfg.provider]) continue;
      const fbKey = budgetTierKey(fbTier, fbCfg.provider, fbCfg.model);
      if (isCooledDown(config.dataDir, fbKey)) {
        console.error(`[llm-router] fallback ${fbTier} skipped (en cooldown)`);
        decision.fallbackTried.push(`${fbCfg.provider}(${fbCfg.model}):cooldown`);
        continue;
      }
      try {
        console.error(`[llm-router] fallback → ${fbTier} (${fbCfg.provider}/${fbCfg.model})`);
        const { text, transport } = await invokeProvider(fbCfg.provider, fbCfg.model, fbTier, prompt, config);
        decision.transport = transport;
        decision.fallbackTried.push(`${fbCfg.provider}(${fbCfg.model})`);
        markSuccess(config.dataDir, fbKey);
        writeAudit(true, `primary failed: ${primaryMsg}. recovered on ${fbTier}.`);
        return { text, decision };
      } catch (fbErr) {
        const fbMsg = (fbErr as Error).message;
        decision.fallbackTried.push(`${fbCfg.provider}(${fbCfg.model})`);
        console.error(`[llm-router] fallback ${fbTier} also failed: ${fbMsg}`);
        recordCooldown(fbTier, fbCfg.provider, fbCfg.model, fbErr as Error);
      }
    }

    const finalMsg = `primary failed: ${primaryMsg}. all fallbacks exhausted (${decision.fallbackTried.join(', ')})`;
    writeAudit(false, finalMsg);
    throw new Error(`[llm-router] ${finalMsg}`);
  }
}
