import { defineConfig } from 'vite';
import { resolve } from 'node:path';

import { copyLicenses } from './scripts/copy-licenses.mjs';
export default defineConfig(({ mode }) => ({
  base: mode === 'hosted' ? '/' : './',
  plugins: [{ name: 'crayon-license-files', closeBundle() { copyLicenses(resolve('demo-dist')); } }],
  define: { __CRAYON_PREPARE_ENDPOINT__: JSON.stringify(mode === 'hosted' ? '/api/player/prepare' : '') },
  build: { outDir: 'demo-dist', target: 'es2019' },
}));
