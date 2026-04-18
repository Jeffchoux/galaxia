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

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { GalaxiaConfig, LLMTier, LLMProvider, LLMProviderConfig } from './types.js';
import type { RoutingContext, RoutingDecision, RoutingAuditEntry } from './routing/types.js';
import { decide } from './routing/engine.js';
import { logRouting } from './routing/audit.js';

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

async function callClaude(prompt: string, config: LLMProviderConfig): Promise<string> {
  try {
    const model = config.model || 'sonnet';
    const output = execSync(
      `claude --model ${model} -p ${JSON.stringify(prompt)}`,
      { encoding: 'utf-8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
    );
    return output.trim();
  } catch (err) {
    throw new Error(`Claude CLI error: ${(err as Error).message}`);
  }
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
  claude: callClaude,
  openai: callOpenAI,
};

// ── Tier-only router (legacy, kept as compat alias) ────────────────────────
// Pre-Phase-3 callers use this. Fallback chain is intentionally conservative:
// light → local → heavy. Never fallback INTO local from a remote tier (that
// would be fine) or FROM local to remote if the caller meant local only
// (they should use callLLM(ctx) for that — this function makes no
// confidentiality promise).

const FALLBACK_CHAIN: LLMTier[] = ['light', 'local', 'heavy'];

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
): Promise<string> {
  const fn = PROVIDER_FN[provider];
  if (!fn) throw new Error(`Unknown LLM provider: ${provider}`);
  // Use the tier's provider config as base (api keys, urls) but override the
  // model with whatever the routing decision picked.
  const baseCfg = config.llm[tier];
  const cfg: LLMProviderConfig = { ...baseCfg, provider, model };
  return fn(prompt, cfg);
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

  // Primary attempt
  try {
    const text = await invokeProvider(decision.provider, decision.model, decision.tier, prompt, config);
    writeAudit(true, undefined);
    return { text, decision };
  } catch (primaryErr) {
    const primaryMsg = (primaryErr as Error).message;
    console.error(`[llm-router] primary ${decision.provider}(${decision.model}) failed: ${primaryMsg}`);

    if (decision.forbidFallback) {
      writeAudit(false, primaryMsg);
      throw new Error(
        `[llm-router] refuse-to-fallback: rule='${decision.matchedRule}' ` +
        `forbade fallback for ctx=${JSON.stringify(ctx)} (${decision.reason}). ` +
        `Primary error: ${primaryMsg}`,
      );
    }

    // Fallback chain — respects the primary tier and skips tiers the decision
    // already tried. Never falls into 'local' if primary was remote (it's
    // fine to go remote → local, but we want predictable behavior).
    for (const fbTier of FALLBACK_CHAIN) {
      if (fbTier === decision.tier) continue;
      const fbCfg = config.llm[fbTier];
      if (!PROVIDER_FN[fbCfg.provider]) continue;
      try {
        console.error(`[llm-router] fallback → ${fbTier} (${fbCfg.provider}/${fbCfg.model})`);
        const text = await invokeProvider(fbCfg.provider, fbCfg.model, fbTier, prompt, config);
        decision.fallbackTried.push(`${fbCfg.provider}(${fbCfg.model})`);
        writeAudit(true, `primary failed: ${primaryMsg}. recovered on ${fbTier}.`);
        return { text, decision };
      } catch (fbErr) {
        const fbMsg = (fbErr as Error).message;
        decision.fallbackTried.push(`${fbCfg.provider}(${fbCfg.model})`);
        console.error(`[llm-router] fallback ${fbTier} also failed: ${fbMsg}`);
      }
    }

    const finalMsg = `primary failed: ${primaryMsg}. all fallbacks exhausted (${decision.fallbackTried.join(', ')})`;
    writeAudit(false, finalMsg);
    throw new Error(`[llm-router] ${finalMsg}`);
  }
}
