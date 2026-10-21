import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(process.env.SERVE_DIST === '1' ? 'dist' : 'public');
const port = Number(process.env.PORT) || 5173;
const basePath = process.env.BASE_PATH || '/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (basePath !== '/' && requested === basePath.slice(0, -1)) { res.writeHead(301, { Location: basePath }).end(); return; }
    if (!requested.startsWith(basePath)) { res.writeHead(404).end(); return; }
    const pathname = '/' + requested.slice(basePath.length);
    const path = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let data = await readFile(path);
    if (path.endsWith(`${sep}sw.js`) && process.env.SERVE_DIST !== '1') {
      const source = data.toString();
      const assets = JSON.parse(source.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
      const hash = createHash('sha256');
      for (const asset of assets) hash.update(await readFile(resolve(root, asset === './' ? 'index.html' : asset)));
      data = Buffer.from(source.replace("'znat-dev-v1'", `'znat-dev-${hash.digest('hex').slice(0, 12)}'`));
    }
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Service-Worker-Allowed': '/'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не найдено'); }
});
server.listen(port, '0.0.0.0', () => console.log(`Аббревиатуры: http://localhost:${port}${basePath}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
