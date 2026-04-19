# Minimal static project example

The smallest thing Galaxia can adopt as a piece. Drop this tree into `/opt/galaxia/projects/<name>/` and declare it in `galaxia.yml`.

```
minimal-static/
├── README.md             ← this file
├── GALAXIA_PIECE.md      ← optional, documents the piece's intent
└── public/
    └── index.html        ← what a backend / deploy would eventually serve
```

Then add to `galaxia.yml → projects[]`:

```yaml
- name: my-static
  path: /opt/galaxia/projects/my-static
  description: Minimal static site to test Galaxia's adoption pipeline.
  allowedShellCommands:
    - git status
  gm:
    enabled: false        # flip to true when you want the GM to track it
```

Restart the daemon. `/projects` on Telegram should list it. `/plan analyse "survey this project"` should produce a read-only preview.
