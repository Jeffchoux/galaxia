#!/usr/bin/env node
// migrate-data.mjs — one-shot migration from ~/.galaxia/data/ to a target dataDir.
//
// Idempotent: skips any destination file that already exists AND is at least as
// recent as the source. Never deletes anything — the caller confirms success
// and removes the old tree manually.
//
// Usage:
//   node scripts/migrate-data.mjs                          # default target: /root/galaxia-data
//   node scripts/migrate-data.mjs --to /path/to/dataDir
//   node scripts/migrate-data.mjs --dry-run                # report only, no writes

import {
  existsSync, readdirSync, statSync, mkdirSync, copyFileSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';

// ── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let target = '/root/galaxia-data';
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--to' && args[i + 1]) {
    target = args[++i];
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: migrate-data.mjs [--to <path>] [--dry-run]');
    process.exit(0);
  }
}

const source = join(homedir(), '.galaxia', 'data');

console.log(`[migrate] source: ${source}`);
console.log(`[migrate] target: ${target}`);
if (dryRun) console.log('[migrate] DRY RUN — no writes');
console.log('');

if (!existsSync(source)) {
  console.log('[migrate] Source does not exist, nothing to do.');
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

let copied = 0, skipped = 0, missing = 0;

function ensureDir(path) {
  if (dryRun) return;
  mkdirSync(path, { recursive: true });
}

function shouldCopy(src, dst) {
  if (!existsSync(dst)) return true;
  try {
    const srcStat = statSync(src);
    const dstStat = statSync(dst);
    // Skip if destination is already newer or equal to source
    return srcStat.mtimeMs > dstStat.mtimeMs;
  } catch {
    return true;
  }
}

function copyOne(src, dst) {
  if (!existsSync(src)) {
    missing++;
    return;
  }
  if (!shouldCopy(src, dst)) {
    console.log(`  [skip]  ${dst} (up to date)`);
    skipped++;
    return;
  }
  ensureDir(dirname(dst));
  if (!dryRun) copyFileSync(src, dst);
  console.log(`  [copy]  ${src}`);
  console.log(`    →     ${dst}`);
  copied++;
}

function walkCopy(srcDir, dstDir) {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const sp = join(srcDir, entry.name);
    const dp = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      walkCopy(sp, dp);
    } else if (entry.isFile()) {
      copyOne(sp, dp);
    }
  }
}

// ── Plan: map legacy layout → new layout ───────────────────────────────────
// Legacy (~/.galaxia/data/):
//   state.json               → $target/state/state.json
//   orchestrator.log         → $target/logs/orchestrator.log
//   daemon.pid               → $target/daemon.pid
//   missions.json            → $target/missions.json
//   knowledge/<proj>.md      → $target/memory/projects/<proj>/KNOWLEDGE.md
//   projects/<proj>/KNOWLEDGE.md → $target/memory/projects/<proj>/KNOWLEDGE.md
//   logs/*                   → $target/logs/*
//   backups/*                → $target/backups/*
// Everything else at the root → reported but not copied (surface to user)

// Root files with explicit mapping
const rootFiles = [
  ['state.json',        join(target, 'state', 'state.json')],
  ['missions.json',     join(target, 'missions.json')],
  ['orchestrator.log',  join(target, 'logs', 'orchestrator.log')],
  ['daemon.pid',        join(target, 'daemon.pid')],
];

console.log('[migrate] Root files');
for (const [rel, dst] of rootFiles) {
  copyOne(join(source, rel), dst);
}

// knowledge/ (flat layout, one .md per project)
const legacyKnowledgeDir = join(source, 'knowledge');
if (existsSync(legacyKnowledgeDir)) {
  console.log('\n[migrate] Legacy flat knowledge/');
  for (const f of readdirSync(legacyKnowledgeDir)) {
    if (!f.endsWith('.md')) continue;
    const proj = f.replace(/\.md$/, '');
    copyOne(
      join(legacyKnowledgeDir, f),
      join(target, 'memory', 'projects', proj, 'KNOWLEDGE.md'),
    );
  }
}

// projects/<proj>/KNOWLEDGE.md (new-style layout that the core already uses)
const legacyProjectsDir = join(source, 'projects');
if (existsSync(legacyProjectsDir)) {
  console.log('\n[migrate] Legacy projects/*/KNOWLEDGE.md');
  for (const proj of readdirSync(legacyProjectsDir)) {
    const src = join(legacyProjectsDir, proj, 'KNOWLEDGE.md');
    if (existsSync(src)) {
      copyOne(src, join(target, 'memory', 'projects', proj, 'KNOWLEDGE.md'));
    }
  }
}

// Full logs/ copy (preserves anything beyond orchestrator.log)
const legacyLogsDir = join(source, 'logs');
if (existsSync(legacyLogsDir)) {
  console.log('\n[migrate] logs/');
  walkCopy(legacyLogsDir, join(target, 'logs'));
}

// Full backups/ copy
const legacyBackupsDir = join(source, 'backups');
if (existsSync(legacyBackupsDir)) {
  console.log('\n[migrate] backups/');
  walkCopy(legacyBackupsDir, join(target, 'backups'));
}

// Detect orphans: any top-level entry not handled above
const known = new Set(['state.json', 'missions.json', 'orchestrator.log', 'daemon.pid', 'knowledge', 'projects', 'logs', 'backups']);
const orphans = readdirSync(source).filter((e) => !known.has(e));
if (orphans.length > 0) {
  console.log('\n[migrate] Unmapped entries in source (left alone, review manually):');
  for (const o of orphans) console.log(`  - ${join(source, o)}`);
}

console.log('');
console.log(`[migrate] Done. copied=${copied} skipped=${skipped} missing=${missing}${dryRun ? ' (dry-run)' : ''}`);
console.log(`[migrate] Source NOT deleted. Remove manually when validated: rm -rf ${source}`);
