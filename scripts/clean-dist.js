// Deletes dist/ before a build so stale artifacts (old entry names, old formats,
// renamed chunks) never linger and get shipped in the published package.
import { rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

rmSync(distDir, { recursive: true, force: true });
console.log('[clean-dist] Removed dist/');
