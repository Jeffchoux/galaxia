# Contributing

Thanks for thinking about contributing to Galaxia. It's early, single-maintainer territory — contributions are welcome, but the project has an unusually strong spine (the MANIFESTO) that every change is measured against.

## The compass

Before opening a PR, check that your change would answer **yes** to all four:

1. Does it preserve the **autonomy** of the user? (No new forced confirmations, no extra friction.)
2. Does it keep working **without a human in the loop** 24/7?
3. Does it work from **Telegram** (phone-first)? Or is it purely a terminal/UI addition that doesn't regress the Telegram side?
4. Does it preserve **sovereignty**? (Self-hosted, no phone-home, no new closed dependency.)

A "no" on any of these is usually grounds for a rework before merge.

## Workflow

1. Open an issue first — even a one-line "I want to add X, is that aligned?" — so we can save you work before you write it.
2. Fork, branch off `main` (branch naming: `phase<N>-<slug>` for phases, `fix/<slug>` or `feat/<slug>` otherwise).
3. Keep commits atomic. PRs for unrelated changes get split on review.
4. Run `pnpm build` across all packages before pushing. If you touch `@galaxia/core`, run it in all downstream packages too (the types chain).
5. Write / update smoke tests in `/tmp/test-<phase-or-feature>-*.mjs`. Tests are Node scripts — minimal, readable, no framework.
6. Update the docs in `docs/` if you change external-facing behaviour. Mention the change in `docs/CHANGELOG.md`.

## Commit message style

Short imperative, lowercase type prefix:

```
phase<N>: <what changed> — <why>
fix: <what> — <why>
docs: …
chore: …
merge: <short>   (for --no-ff merges on main)
```

Don't include "Co-authored-by" unless the tool you're using requires it.

## Coding style

- TypeScript strict, `noImplicitAny`, `exactOptionalPropertyTypes`.
- No new `npm install` unless the PR justifies it in its description. `scrypt`, `fetch`, `crypto` are already available in Node — use them before reaching for a dep.
- Default to **no comment**. If you need a comment, explain the **why** in one line, not the **what**.
- Never hard-code a path — read it through `resolveDataDir` / `configSearchPaths`.
- No `any`. If you truly need dynamic shape, type it as `unknown` and narrow.

## Testing philosophy

Smoke tests cover the behaviour you committed, not the behaviour of the framework. One run of `node /tmp/test-<feature>.mjs` should print `N/N pass` in under a few seconds. No mocks unless necessary; prefer an injectable `runner` function (see `ProjectGMOptions.agentRunner`).

## Don't

- Don't open a PR that also runs `git push` for release tagging. Releases are manual (see `docs/CHANGELOG.md`).
- Don't include generated artifacts (`dist/`, `node_modules/`, `.next/`) — they're in `.gitignore` for a reason.
- Don't add "AI co-author" signatures to commits you didn't co-write.
- Don't modify `docs/MANIFESTO.md` without opening a separate, discussion-oriented issue. It's the project's constitution, not a living doc.

Welcome.
