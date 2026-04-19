# General Manager

A General Manager (GM) is a per-project AI loop that runs in the background. It is NOT an agent that executes code — it's a **decider**. Every `intervalMinutes` (default 30) it asks an LLM: *"given this project state, its recent actions, and its current objectives, what's the single next best move?"* It then acts on that decision (dispatch an agent, wait, or drop an objective).

## Option C (the one we shipped)

The GM is autonomous but the owner can inject high-level objectives on the fly:

```
/objective learn-ai "ajouter des tests pour le module auth"
```

The GM picks up the objective on its next review. Objectives carry a priority (default 3) and a status. The GM can drop them when they're obsolete.

## Lifecycle

1. **Load state** — `gm-state.json` in `memory/projects/<name>/`.
2. **Check paused flag** — if paused, log "paused" to the journal and skip.
3. **Call the brain** — `decideNext(project, state, gmConfig, config)` — an LLM call with a strict JSON output schema.
4. **Parse the decision** — `parseGMDecision()` safely extracts the first `{…}` block; garbage input → `wait`.
5. **Act on the decision** :
   - `dispatch` → `getAgent(type).run(task, ctx)` — records `outcome: success | failure` in the journal.
   - `drop-objective` → removes the matching objective from `currentObjectives`.
   - `wait` → just logs the rationale.
6. **Append to journal** — `gm-journal.jsonl` (one line per action).
7. **Save state** — updates `recentActions` (ring buffer 20), `lastReviewAt`, `nextReviewAt`, `cyclesRun`.

## The brain prompt

Every review produces a prompt of the form:

```
You are the General Manager IA for the "<project>" project.
You track its objectives, its recent actions, and decide the single next best move.
Output STRICT JSON on a single line — no markdown fences, no prose around it.

Schema:
  {"kind":"dispatch","agent":"<dev|…>","task":"<short task>","reason":"<why>","priority":1..5}
  {"kind":"wait","reason":"<why>","untilNextReviewIn":<optional minutes>}
  {"kind":"drop-objective","objectiveId":"<id>","reason":"<why>"}

Pick wait when you have no confident move or when an agent was just dispatched for the same task.
```

Followed by the project path, current objectives (`[id] (priority) description`), the last 5 actions, and the health score.

The decision is routed through `callLLM({dataClass:'professional', taskType:'triage', projectTag})` — so your routing rules apply (e.g. a `project: legal-asa` GM will run in local-only).

## State shape

```ts
interface GMState {
  project: string;
  enabled: boolean;
  paused: boolean;
  healthScore: number;              // 0..1, reserved for future heuristics
  currentObjectives: GMObjective[];
  recentActions: GMAction[];        // last 20
  lastReviewAt?: string;
  nextReviewAt?: string;
  cyclesRun: number;
}
```

## Activation

In `galaxia.yml` per project:

```yaml
projects:
  - name: learn-ai
    path: /opt/galaxia/projects/learn-ai
    gm:
      enabled: true
      intervalMinutes: 30       # floor 5 min
      # extraSystem: "..."      # optional append to the brain prompt
```

One `runGMLoop()` handle per enabled project. All loops share the daemon process and shut down cleanly on `SIGTERM`.

## Telegram commands

- `/objective <project> "<text>"` — add an objective (scope enforced).
- `/gm <project>` — show state (objectives, last decision, next review).
- `/gm <project> pause` — stop the loop's next review.
- `/gm <project> resume` — relaunch.

## What GMs **don't** do (v1)

- They don't execute the action plans their agents produce. The `plan` lives in the action runner's dry-run territory; the owner applies via `/plan <agent> "<task>"` → confirm.
- They don't cross-project (yet). Future work: a GM calling another project's GM.
- They don't talk to Worldseed directly through routing — use `consultWorldseed('strategy-analysis', …)` explicitly if you want that.
