import { spawnSync } from 'node:child_process';
import type { GitCommitAction, ActionResult } from '../types.js';

/**
 * Local git commit. We never pass `--push`, never shell out to
 * `git push`, and the permission check already rejected any commit
 * message mentioning push. The apply flow runs `git add` + `git commit`
 * inside the project path only.
 */
export async function execGitCommit(action: GitCommitAction, projectPath: string, dryRun: boolean): Promise<ActionResult> {
  if (dryRun) {
    const target = action.paths?.length ? action.paths.join(' ') : '-A (project root)';
    return { kind: 'git-commit', success: true, dryRun, summary: `would git add ${target} && git commit -m "${action.message}" in ${projectPath}`, durationMs: 0 };
  }
  const start = Date.now();
  const addArgs = action.paths?.length ? ['add', '--', ...action.paths] : ['add', '-A', '.'];
  const add = spawnSync('git', addArgs, { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 });
  if (add.error || add.status !== 0) {
    return { kind: 'git-commit', success: false, dryRun, summary: 'git add failed', error: add.error?.message ?? add.stderr, durationMs: Date.now() - start };
  }
  const commit = spawnSync('git', ['commit', '-m', action.message], { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 });
  if (commit.error) {
    return { kind: 'git-commit', success: false, dryRun, summary: 'git commit failed to spawn', error: commit.error.message, durationMs: Date.now() - start };
  }
  const ok = commit.status === 0;
  return {
    kind: 'git-commit',
    success: ok,
    dryRun,
    summary: `git commit exit=${commit.status} (${action.message.slice(0, 60)})`,
    output: [commit.stdout, commit.stderr].filter(Boolean).join('\n').slice(0, 2000),
    error: ok ? undefined : commit.stderr || `exit ${commit.status}`,
    durationMs: Date.now() - start,
  };
}
