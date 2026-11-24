// Dependency-free, localhost-only static server for development.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 5173;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const resource = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(root, resource);
    const rel = relative(root, file);
    const allowed = /^(?:css|js|samples)[/\\]/.test(rel) || rel === 'index.html';
    if (!allowed || isAbsolute(rel) || rel.startsWith('..') || !mime[extname(file)]) {
      res.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.on('error', error => {
  console.error('Server could not start:', error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`TimeSeries Lab: http://127.0.0.1:${port}/`));
