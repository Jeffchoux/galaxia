import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function startDashboard(port = 3333, staticDir?: string): void {
  const dir = staticDir ?? join(import.meta.dirname, '..', 'public');

  const server = createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
    const filePath = join(dir, url);

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(content);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  });

  server.listen(port, () => {
    console.log(`[galaxia] 3D Command Center running at http://localhost:${port}`);
  });
}
