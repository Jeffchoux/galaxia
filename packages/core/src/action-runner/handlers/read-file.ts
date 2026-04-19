import { readFileSync, existsSync, statSync } from 'node:fs';
import type { ReadFileAction, ActionResult } from '../types.js';

const DEFAULT_MAX = 64 * 1024;

export async function execReadFile(action: ReadFileAction, dryRun: boolean): Promise<ActionResult> {
  const start = Date.now();
  if (!existsSync(action.path)) {
    return { kind: 'read-file', success: false, dryRun, summary: `${action.path}: not found`, error: 'ENOENT', durationMs: 0 };
  }
  const max = action.maxBytes ?? DEFAULT_MAX;
  if (dryRun) {
    const size = statSync(action.path).size;
    return { kind: 'read-file', success: true, dryRun, summary: `would read ${action.path} (${size}B, cap ${max}B)`, durationMs: 0 };
  }
  try {
    const buf = readFileSync(action.path);
    const truncated = buf.byteLength > max;
    const output = (truncated ? buf.subarray(0, max) : buf).toString('utf-8');
    const note = truncated ? ` (truncated from ${buf.byteLength}B)` : '';
    return { kind: 'read-file', success: true, dryRun, summary: `read ${action.path} (${output.length}B${note})`, output, durationMs: Date.now() - start };
  } catch (err) {
    return { kind: 'read-file', success: false, dryRun, summary: `${action.path} read failed`, error: (err as Error).message, durationMs: Date.now() - start };
  }
}
