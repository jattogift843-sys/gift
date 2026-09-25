import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The two frontend bundles (frontend/site, frontend/app) are each fully
 * self-contained so they can be deployed independently. A handful of files are
 * genuinely shared — this script copies the canonical copies from
 * `frontend/app` into `frontend/site` so they never drift.
 *
 * Edit shared files in frontend/app/... then run:  npm run frontend:sync
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(ROOT, 'frontend', 'app');
const to = path.join(ROOT, 'frontend', 'site');

const SHARED = [
  'assets/css/styles.css',
  'assets/js/core.js',
  'assets/js/i18n.js',
  'assets/js/testimonial-popup.js',
  'assets/img/logo.svg',
];

let copied = 0;
for (const rel of SHARED) {
  const src = path.join(from, rel);
  const dst = path.join(to, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied += 1;
  console.log(`  ${rel}`);
}
console.log(`\nSynced ${copied} shared file(s) → frontend/site`);
