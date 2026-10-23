import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(root, '.package-check');
mkdirSync(work, { recursive: true });
const temp = mkdtempSync(resolve(work, 'run-'));
if (!temp.startsWith(work + sep)) throw new Error('Invalid temporary package directory');
try {
  const npm = process.env.npm_execpath;
  assert(npm, 'Run this check with npm run package:check');
  const [packed] = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8' }));
  const files = packed.files.map(file => file.path);
  for (const file of ['dist/crayon-player.mjs', 'dist/crayon-player.cjs', 'dist/crayon-player.iife.js', 'dist/server.mjs', 'dist/server.cjs', 'dist/index.d.ts', 'dist/server.d.ts', 'README.md', 'LICENSE', 'NOTICE.md', 'THIRD_PARTY_LICENSES/ARTPLAYER-MIT.txt', 'THIRD_PARTY_LICENSES/APACHE-2.0.txt']) assert(files.includes(file), `Missing ${file}`);
  assert(!files.some(file => /(?:^|\/)(?:\.env|\.dev.vars|\.git|node_modules|test|demo-dist|\.wrangler)(?:[./]|$)/.test(file)), 'Unexpected private/generated package file');
  execFileSync('tar', ['-xzf', resolve(temp, packed.filename), '-C', temp]);
  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(resolve(temp, 'package/package.json'), 'utf8'));
  for (const format of ['import', 'require']) {
    const entry = resolve(temp, 'package', manifest.exports['.'][format]);
    const api = format === 'import' ? await import(pathToFileURL(entry).href) : require(entry);
    for (const name of ['createCrayonPlayer', 'createCrayonPlayerCore', 'createMediaPreparer', 'attachCasting', 'filterVodAdSegments']) assert.equal(typeof api[name], 'function', `${format}: ${name}`);
    const serverEntry = resolve(temp, 'package', manifest.exports['./server'][format]);
    const server = format === 'import' ? await import(pathToFileURL(serverEntry).href) : require(serverEntry);
    assert.equal(typeof server.handleMediaRelay, 'function');
  }
  console.log(`Package verified: ${packed.filename}; ESM, CommonJS, browser bundle, server and declarations present.`);
} finally {
  if (!temp.startsWith(work + sep)) throw new Error('Refusing to remove an unexpected directory');
  rmSync(temp, { recursive: true, force: true });
}
