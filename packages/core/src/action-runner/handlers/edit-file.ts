import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EditFileAction, ActionResult } from '../types.js';

export async function execEditFile(action: EditFileAction, dryRun: boolean): Promise<ActionResult> {
  const start = Date.now();
  const mode = action.mode ?? 'overwrite';
  const exists = existsSync(action.path);
  if (mode === 'create' && exists) {
    return { kind: 'edit-file', success: false, dryRun, summary: `${action.path}: already exists (mode=create)`, error: 'file exists', durationMs: 0 };
  }
  if (dryRun) {
    const bytes = Buffer.byteLength(action.contents, 'utf-8');
    const verb = exists ? (mode === 'append' ? 'append' : 'overwrite') : 'create';
    return { kind: 'edit-file', success: true, dryRun, summary: `would ${verb} ${action.path} (${bytes}B)`, durationMs: 0 };
  }
  try {
    mkdirSync(dirname(action.path), { recursive: true });
    if (mode === 'append') appendFileSync(action.path, action.contents, 'utf-8');
    else writeFileSync(action.path, action.contents, 'utf-8');
    const bytesNow = existsSync(action.path) ? readFileSync(action.path).byteLength : 0;
    return { kind: 'edit-file', success: true, dryRun, summary: `${mode} ${action.path} (${bytesNow}B)`, durationMs: Date.now() - start };
  } catch (err) {
    return { kind: 'edit-file', success: false, dryRun, summary: `${action.path} write failed`, error: (err as Error).message, durationMs: Date.now() - start };
  }
}
