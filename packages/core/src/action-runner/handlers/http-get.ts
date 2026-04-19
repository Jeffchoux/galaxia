import type { HttpGetAction, ActionResult } from '../types.js';

const DEFAULT_MAX = 256 * 1024;

export async function execHttpGet(action: HttpGetAction, dryRun: boolean): Promise<ActionResult> {
  if (dryRun) {
    return { kind: 'http-get', success: true, dryRun, summary: `would GET ${action.url}`, durationMs: 0 };
  }
  const start = Date.now();
  const max = action.maxBytes ?? DEFAULT_MAX;
  try {
    const res = await fetch(action.url, { method: 'GET', headers: action.headers, redirect: 'follow' });
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    const truncated = bytes > max;
    const body = (truncated ? buf.slice(0, max) : buf) as ArrayBuffer;
    const text = new TextDecoder().decode(body);
    return {
      kind: 'http-get',
      success: res.ok,
      dryRun,
      summary: `GET ${action.url} ${res.status} (${bytes}B${truncated ? ' truncated' : ''})`,
      output: text,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return { kind: 'http-get', success: false, dryRun, summary: `GET ${action.url} failed`, error: (err as Error).message, durationMs: Date.now() - start };
  }
}
