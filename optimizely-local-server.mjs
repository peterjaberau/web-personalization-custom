// Local Optimizely demo server. Only the listed AEM fragments can be proxied.
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
]);
const contentRoot = '/content/experience-fragments/vha/experience_fragment/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' };

createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end('Method not allowed');
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__aem-fragment') {
      const path = url.searchParams.get('path') || '';
      if (!allowedPaths.has(path)) {
        res.writeHead(400).end('Fragment path is not allowed');
        return;
      }
      const upstream = new URL('https://www.vodafone.com.au/rest/experienceFragments');
      upstream.searchParams.set('path', contentRoot + path);
      const response = await fetch(upstream, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        res.writeHead(502).end(`Vodafone returned HTTP ${response.status}`);
        return;
      }
      const body = await response.text();
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
