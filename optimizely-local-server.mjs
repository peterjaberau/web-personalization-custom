// Local Optimizely demo server. The listed AEM fragments are saved snapshots.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || '127.0.0.1';
// Only demo files and fragment JSON are served; repository metadata stays private.
const publicFiles = new Set([
  '/index-optimizely.html', '/personalization-optimizely.js', '/debug.js', '/style.css',
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff' };

createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end('Method not allowed');
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = url.pathname === '/' ? '/index-optimizely.html' : decodeURIComponent(url.pathname);
    const parts = name.split('/');
    const isFragment = name.startsWith('/vha/experience_fragment/') && extname(name).toLowerCase() === '.json'
      && parts.every((part) => part !== '.' && part !== '..' && !part.startsWith('.'));
    if (!publicFiles.has(name) && !isFragment) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = await realpath(resolve(root, `.${name}`));
    const realRoot = await realpath(root);
    if (!file.startsWith(realRoot + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch (error) {
    if (error.code === 'ENOENT') res.writeHead(404).end('Not found');
    else {
      console.error('Local server error:', error.message);
      res.writeHead(502).end('Unable to retrieve the requested content');
    }
  }
}).listen(port, host, () => {
  console.log(`Optimizely demo: http://${host}:${port}/index-optimizely.html`);
});
