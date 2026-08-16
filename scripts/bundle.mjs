#!/usr/bin/env node
// Bundles an app (api | worker) into a single runnable ESM file at dist/index.js.
// Usage: node scripts/bundle.mjs <app>

import { build } from 'esbuild';
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];

if (!['api', 'worker'].includes(app)) {
  console.error(`Usage: node scripts/bundle.mjs <api|worker>`);
  process.exit(1);
}

const outdir = resolve(root, 'apps', app, 'dist');
mkdirSync(outdir, { recursive: true });

const outfile = resolve(outdir, 'index.js');

await build({
  entryPoints: [resolve(root, 'apps', app, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  logLevel: 'info',
  external: [
    // Runtime-native / .node-embedded modules that must not be inlined.
    '@prisma/client',
    '@prisma/engines',
    '.prisma/client',
  ],
});

// Prisma needs its query-engine binaries available relative to the bundle.
const prismaClientDir = resolve(root, 'node_modules', '.prisma', 'client');
if (existsSync(prismaClientDir)) {
  cpSync(prismaClientDir, resolve(outdir, 'node_modules', '.prisma', 'client'), {
    recursive: true,
  });
}

console.log(`Bundled apps/${app} -> ${outfile}`);
