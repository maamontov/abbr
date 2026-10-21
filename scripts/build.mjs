import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCatalog } from '../public/game.js';

createCatalog(JSON.parse(await readFile('public/data/abbreviations.json', 'utf8')));
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
// Version the complete offline bundle, including the data and every local asset.
const sw = await readFile('public/sw.js', 'utf8');
const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const hash = createHash('sha256');
for (const asset of assets) hash.update(await readFile(`public/${asset === './' ? 'index.html' : asset.replace(/^\.\//, '')}`));
const version = hash.digest('hex').slice(0, 12);
await writeFile('dist/sw.js', sw.replace("'znat-dev-v1'", `'znat-${version}'`));
console.log(`Готово: dist/ · 250 аббревиатур · офлайн-пакет ${version}`);
