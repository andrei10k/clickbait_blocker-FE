import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));

// Explicit allowlist: only what the extension loads at runtime. Packaging the
// repo root is how node_modules ends up in a store upload.
const files = ['manifest.json', 'css', 'image', 'js/build', 'vendor', 'view'];

// Store promo images and a duplicate icon that nothing references.
const skip = ['image/bannars/*', 'image/icon copy.png'];

const dist = join(root, 'dist');
const archive = join(dist, `clickbait-blocker-${manifest.version}.zip`);

await mkdir(dist, { recursive: true });
await rm(archive, { force: true });
execFileSync('zip', ['-r', '-q', archive, ...files, '-x', ...skip], { cwd: root });

console.log(`packaged ${archive}`);
