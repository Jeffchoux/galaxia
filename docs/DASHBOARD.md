# Dashboard

A lightweight observability web UI, mounted at `/dashboard/` on the instance's domain. Auth is password + cookie; scope is enforced server-side per API endpoint.

## Access

`https://<host>/dashboard/` → redirect to `login.html` if no session cookie. Log in with `userName + password` from `galaxia.yml → users[]`.

## Pages

| Tab | Endpoint behind | What it shows |
|---|---|---|
| Overview | `/api/state`, `/api/projects` | CPU/RAM/disk/PM2/scope summary. |
| Projects | `/api/projects` | Table: name · path · GM on/off · status · last cycle · backlog. |
| Audit | `/api/audit?n=50` | 50 latest routing decisions, filtered by scope. |
| Missions | `/api/missions` | Active missions with status. |
| Users | `/api/users` | **Owner only.** Full user list with scope + auth channels. |

## API

Every API endpoint returns JSON. `GET` only. All require the `gx_session` cookie except `/api/me` (which is "who am I" and returns `{authenticated:false}` instead of 401).

```
POST /api/login       { userName, password }  → { ok, user }  + Set-Cookie
POST /api/logout                              → { ok }          + clear cookie
GET  /api/me                                   → { authenticated, user? }
GET  /api/state                                → filtered GalaxiaState
GET  /api/projects                             → [{ project, runtime, gm }]
GET  /api/audit?n=50&project=...               → { entries: [...] }
GET  /api/missions                             → { missions: [...] }
GET  /api/users                                → owner only
```

Scope filtering happens server-side, not in the client — a collaborator cannot pull another project's audit by editing a URL.

## Auth internals

- Password hash format: `scrypt$<salt-hex>$<hash-hex>` (16-byte salt, 64-byte hash, scrypt N=16384 default).
- Session token: 32 bytes hex, in-memory map (daemon restart invalidates).
- Cookie: `gx_session=<token>; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`.
- Compare via `timingSafeEqual` to avoid a timing oracle.

Generate a hash:

```bash
node -e "import('/opt/galaxia/packages/core/dist/index.js').then(({hashPassword})=>console.log(hashPassword('MyNewPassword')))"
```

## nginx

```nginx
location /dashboard/ {
    proxy_pass http://127.0.0.1:3333/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /dashboard/events {
    proxy_pass http://127.0.0.1:3333/events;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
}
```

The dashboard HTML uses **relative paths** for `fetch()` and `<a href>` so the `/dashboard/` prefix just works without rewrite headers.

## 3D legacy view

The Phase 1-era Three.js 3D command center is preserved at `/dashboard/3d.html`. SSE endpoint is `/dashboard/events`. It's read-only. Keep it, remove it, or replace it — it's independent of the observability tabs.
