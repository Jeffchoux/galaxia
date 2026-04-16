// GALAXIA LLM Router — port of /opt/agents/shared/llm-router.sh
// Routes prompts to the right provider based on tier

import { execSync } from 'node:child_process';
import type { GalaxiaConfig, LLMTier, LLMProviderConfig } from './types.js';

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

  const data = (await res.json()) as GroqResponse; // Same shape
  return data.choices?.[0]?.message?.content ?? '';
}

const PROVIDER_FN: Record<string, (prompt: string, config: LLMProviderConfig) => Promise<string>> = {
  groq: callGroq,
  ollama: callOllama,
  claude: callClaude,
  openai: callOpenAI,
};

// Fallback chain: if the primary provider fails, try the next one
const FALLBACK_CHAIN: LLMTier[] = ['light', 'local', 'heavy'];

export async function callLLM(tier: LLMTier, prompt: string, config: GalaxiaConfig): Promise<string> {
  const providerConfig = config.llm[tier];
  const fn = PROVIDER_FN[providerConfig.provider];

  if (!fn) {
    throw new Error(`Unknown LLM provider: ${providerConfig.provider}`);
  }

  // Try the requested tier first
  try {
    return await fn(prompt, providerConfig);
  } catch (err) {
    console.error(`[llm-router] ${tier} (${providerConfig.provider}) failed:`, (err as Error).message);
  }

  // Try fallback chain
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
