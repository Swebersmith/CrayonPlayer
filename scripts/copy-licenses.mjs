import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function copyLicenses(target) {
  mkdirSync(target, { recursive: true });
  for (const file of ['LICENSE', 'NOTICE.md', 'THIRD_PARTY_LICENSES']) cpSync(resolve(root, file), resolve(target, file), { recursive: true });
}
