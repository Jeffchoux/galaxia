# Routing

Galaxia never picks an LLM provider silently. Every `callLLM()` goes through a rules engine and logs the decision — you can read every line of `routing-audit.jsonl` and see *what model was consulted, why, and what happened*.

## The two dimensions

A `RoutingContext` has two knobs:

- **`dataClass`** — *what* is being processed. Built-in values: `public`, `personal`, `professional`, `confidential`, `secret`. Extensible (any string you want).
- **`taskType`** — *what* needs to happen. Built-in values: `analysis`, `triage`, `creative-writing`, `code-gen`, … Extensible.

Plus optional `projectTag` and `timeWindow` for finer-grained rules.

## Tiers

Each provider is a tier:

| Tier | Default | Intent |
|---|---|---|
| `local` | Ollama (gemma, llama3.2) | Runs on your box. Data never leaves. |
| `light` | Groq llama-3.3 | Cheap, fast, cloud. |
| `medium` | (same as light by default) | reserved |
| `heavy` | Claude Sonnet | Expensive, strong reasoning. |

Tier mapping → provider config lives in `galaxia.yml → llm.{local,light,medium,heavy}`.

## Rules

Rules are matched **specific → general** (first match wins), configured in `galaxia.yml`:

```yaml
routing:
  strictLocalOnly: true       # confidential/secret data can't fall through to a remote provider even on timeout
  auditLogMaxMB: 10
  rules:
    - name: confidential-stays-local
      description: "Confidential or secret never leaves the host."
      when:
        dataClassIn: [confidential, secret]
      then:
        tier: local
        forbidFallback: true

    - name: legal-asa-analysis-local
      description: "Legal analyses in project legal-asa — strict confidentiality."
      when:
        projectTag: legal-asa
        taskType: analysis
      then:
        tier: local
        forbidFallback: true

    - name: creative-writing-uses-claude
      when:
        taskType: creative-writing
      then:
        tier: heavy

    - name: public-goes-light
      when:
        dataClass: public
      then:
        tier: light
```

## strictLocalOnly

When a rule produces `local + forbidFallback: true`, and the local provider is down, the call **throws** instead of silently escalating to a remote provider. This is the structural guarantee that backs the "confidential data never fuits" promise.

## The audit log

Every decision appends one line to `/root/galaxia-data/logs/routing-audit.jsonl`:

```json
{
  "ts": "2026-04-19T06:24:16.528Z",
  "ctx": { "dataClass": "professional", "taskType": "analysis", "projectTag": "learn-ai" },
  "decision": { "matchedRule": "creative-writing-uses-claude", "tier": "heavy", "provider": "claude", "model": "claude-sonnet-4-5-20250929", "transport": "cli" },
  "promptHash": "sha256:ab…",
  "outcome": "ok",
  "durationMs": 482
}
```

Rotation at `auditLogMaxMB` (default 10). Prompt content itself is **not** logged, only its SHA-256 hash, so you can verify the audit without leaking sensitive text.

## Reading the audit from Telegram or dashboard

- `/audit [N]` on Telegram — last N entries.
- `/dashboard/` → Audit tab — filtered by project scope.
- `/api/audit?n=50&project=learn-ai` — JSON.
