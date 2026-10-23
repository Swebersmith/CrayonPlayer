import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'release');
if (!destination.startsWith(root + sep)) throw new Error('Invalid release directory');
mkdirSync(destination, { recursive: true });
if (!process.env.npm_execpath) throw new Error('Run with npm run release');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: root, encoding: 'utf8' }));
const names = [packed.filename];
for (const [directory, kind] of [['dist', 'browser'], ['demo-dist', 'static']]) {
  const name = `crayon-player-${kind}-${version}.tar.gz`;
  execFileSync('tar', ['-czf', resolve(destination, name), '-C', resolve(root, directory), '.']);
  names.push(name);
}
const checksums = names.map(name => `${createHash('sha256').update(readFileSync(resolve(destination, name))).digest('hex')}  ${name}`).join('\n') + '\n';
writeFileSync(resolve(destination, 'SHA256SUMS.txt'), checksums);
console.log(`Release ${version}:\n${names.map(name => `release/${name}`).join('\n')}\nrelease/SHA256SUMS.txt`);
