import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

import { copyLicenses } from './copy-licenses.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist');
if (!outDir.startsWith(root + sep) || outDir === root) throw new Error('Invalid build directory');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);
const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json', '--emitDeclarationOnly'], { cwd: root, stdio: 'inherit' });
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const banner = `/*! Crayon Player ${version} | CC-BY-NC-SA-4.0 | See LICENSE and NOTICE.md */`;
for (const [entry, formats, name] of [['index', ['es', 'cjs', 'iife'], 'CrayonPlayer'], ['server', ['es', 'cjs'], undefined]]) {
  await build({
    configFile: false, root,
    build: {
      outDir, emptyOutDir: false, target: 'es2019', minify: 'esbuild',
      lib: {
        entry: resolve(root, `src/${entry}.ts`), formats, name,
        fileName: format => `${entry === 'index' ? 'crayon-player' : 'server'}.${format === 'es' ? 'mjs' : format === 'cjs' ? 'cjs' : 'iife.js'}`,
      },
      rollupOptions: { output: { banner } },
    },
  });
}
copyLicenses(outDir);
