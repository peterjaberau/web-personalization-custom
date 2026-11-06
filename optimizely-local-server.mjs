// Local Optimizely demo server. The listed AEM fragments are saved snapshots.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const port = 8765;
const allowedPaths = new Set([
  'banner/business/team-plan/master',
  'banner/business/sim-plan/sim-360',
  'banner/business/eofy26/nbn/master',
  'banner/business/iphone18promax/master',
  'banner/business/iphone-duo/master',
]);
// Only demo assets are served; repository metadata and unrelated files stay private.
const publicFiles = new Set([
  '/index-optimizely.html', '/personalization-optimizely.js', '/debug.js', '/style.css',
  '/assets/vodafone/js/hero-banner.min.js',
  '/assets/vodafone/images/VF-HP-desktop-offer-Teams-4000-920.webp',
  '/assets/vodafone/images/VF-HP-MOB-TEAMS.webp',
  "/assets/vodafone/images/business/VF-HP-MOB-SIMO-360-copy.webp",
  "/assets/vodafone/images/business/VF-HP-MOB-TEAMS.webp",
  "/assets/vodafone/images/business/VF-HP-MOB-iphone-Duo.webp",
  "/assets/vodafone/images/business/VF-HP-desktop-SIMO-360-4000-920.webp",
  "/assets/vodafone/images/business/VF-HP-desktop-iPhonePro-4000-920 2.webp",
  "/assets/vodafone/images/business/VF-HP-desktop-internet-4000-920.webp",
  "/assets/vodafone/images/business/VF-HP-desktop-iphone-Duo-4000-920.webp",
  "/assets/vodafone/images/business/VF-HP-desktop-offer-Teams-4000-920.webp",
  "/assets/vodafone/images/business/VF-HP-iPhone18-MOB.webp",
  "/assets/vodafone/images/business/VF-internet-mob.webp",
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' };

createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end('Method not allowed');
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__aem-fragment') {
      const path = (url.searchParams.get('path') || '').replace(/^\/+/, '');
      if (!allowedPaths.has(path)) {
        res.writeHead(400).end('Fragment path is not allowed');
        return;
      }
      const snapshot = resolve(root, 'assets/vodafone/fragments', `${path}.json`);
      const body = await readFile(snapshot);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
      return;
    }
    const name = url.pathname === '/' ? '/index-optimizely.html' : decodeURIComponent(url.pathname);
    if (!publicFiles.has(name)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const file = resolve(root, `.${name}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
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
}).listen(port, '127.0.0.1', () => {
  console.log(`Optimizely demo: http://127.0.0.1:${port}/index-optimizely.html`);
});
