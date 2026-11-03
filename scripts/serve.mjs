import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8000);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const name = pathname === '/' ? '/index.html' : pathname;
  const filename = path.resolve(root, '.' + name);
  if (!filename.startsWith(root + path.sep) || name.split('/').includes('..') || name.includes('\\') || name.split('/').some(segment => segment.startsWith('.'))) {
    response.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(filename);
    response.writeHead(200, { 'Content-Type': `${types[path.extname(filename)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500).end();
  }
}).listen(port, '0.0.0.0', () => console.log(`Тренажёр доступен на http://localhost:${port}/`));
