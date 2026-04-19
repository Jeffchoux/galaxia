// GALAXIA Worldseed — adapter / fallback wrapper.
//
// Exposes `consultWorldseed()` that the GMs call when routing decides a
// task is a Worldseed capability. On timeout / error, falls back to the
// regular LLM router (so the GM always gets an answer). The fallback
// channel is visible in the returned `transport` field so audit logs
// can tell a direct Worldseed reply from a fallback.

import type { GalaxiaConfig } from '../types.js';
import { callLLM } from '../llm-router.js';
import { askWorldseed, WorldseedUnavailableError } from './client.js';
import type { WorldseedCapability, WorldseedResponse } from './types.js';

export interface ConsultOptions {
  /** Meta attached to the Worldseed request (project, GM objective id, …). */
  meta?: Record<string, unknown>;
  /** Override Worldseed timeout. Default 60s. */
  timeoutMs?: number;
  /** When true, do NOT fallback to callLLM on Worldseed timeout — throw instead.
   * Useful for "Worldseed or nothing" tasks (data-scoring with no useful
   * generic-LLM answer). Default false. */
  noFallback?: boolean;
}

export interface ConsultResult {
  text: string;
  /** 'worldseed' when answered by Worldseed, 'fallback-llm' when we
   * routed to the normal LLM because Worldseed was unreachable. */
  source: 'worldseed' | 'fallback-llm';
  /** The raw Worldseed response (absent on fallback). */
  worldseed?: WorldseedResponse;
  /** Error message when Worldseed was tried and failed (kept for audit). */
  worldseedError?: string;
}

export async function consultWorldseed(
  capability: WorldseedCapability,
  prompt: string,
  config: GalaxiaConfig,
  options: ConsultOptions = {},
): Promise<ConsultResult> {
  try {
    const resp = await askWorldseed(capability, prompt, {
      meta: options.meta,
      timeoutMs: options.timeoutMs,
    });
    if (resp.ok) {
      return { text: resp.text ?? '', source: 'worldseed', worldseed: resp };
    }
    // Worldseed answered but flagged !ok — treat as a failure for
    // fallback purposes but propagate the error text.
    if (options.noFallback) {
      throw new WorldseedUnavailableError(resp.error ?? 'Worldseed returned ok=false');
    }
    return await fallback(prompt, config, resp.error ?? 'Worldseed returned ok=false');
  } catch (err) {
    const msg = (err as Error).message;
    if (options.noFallback) throw err;
    return await fallback(prompt, config, msg);
  }
}

async function fallback(prompt: string, config: GalaxiaConfig, worldseedError: string): Promise<ConsultResult> {
  const { text } = await callLLM(
    { dataClass: 'professional', taskType: 'analysis' },
    `Worldseed was unavailable for this request (${worldseedError}). Answer directly:\n\n${prompt}`,
    config,
  );
  return { text, source: 'fallback-llm', worldseedError };
}
