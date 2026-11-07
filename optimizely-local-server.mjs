// Local demo server for site HTML, JavaScript and CSS.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || '127.0.0.1';
const excludedFolders = new Set(['optimizely', 'temporary']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end('Method not allowed');
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = url.pathname === '/' ? '/index-optimizely.html' : decodeURIComponent(url.pathname);
    const parts = name.split('/');
    const extension = extname(name).toLowerCase();
    const allowedType = extension === '.html' || extension === '.js' || extension === '.css'
      || (extension === '.json' && name.startsWith('/vha/experience_fragment/'));
    if (!allowedType || parts.some((part) => part.startsWith('.') || excludedFolders.has(part.toLowerCase()))) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = await realpath(resolve(root, `.${name}`));
    const realRoot = await realpath(root);
    const realParts = file.slice(realRoot.length + 1).split(sep);
    const realExtension = extname(file).toLowerCase();
    const realAllowedType = realExtension === '.html' || realExtension === '.js' || realExtension === '.css'
      || (realExtension === '.json' && realParts[0] === 'vha' && realParts[1] === 'experience_fragment');
    if (!file.startsWith(realRoot + sep) || realParts.some((part) => part.startsWith('.') || excludedFolders.has(part.toLowerCase())) || !realAllowedType) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store' }).end(data);
  } catch (error) {
    if (error.code === 'ENOENT') res.writeHead(404).end('Not found');
    else {
      console.error('Local server error:', error.message);
      res.writeHead(502).end('Unable to retrieve the requested content');
    }
  }
}).listen(port, host, () => {
  console.log(`Optimizely demo: http://${host}:${port}/index-optimizely.html`);
  console.log(`Salesforce demo: http://${host}:${port}/index.html`);
});
