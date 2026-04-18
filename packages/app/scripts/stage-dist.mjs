// Prepares a minimal staging directory that electron-builder packs, avoiding
// pnpm's workspace-linked node_modules entirely.
//
// Why: our main + preload are self-contained CJS bundles (see
// scripts/build-preload.mjs) that inline every workspace dependency. At
// runtime the installed app needs nothing from node_modules. But pnpm's
// packages/app/node_modules/@word/* symlinks point UP into the monorepo; if
// electron-builder follows them during asar packing it either wastes
// megabytes packing source, or — on macOS/Windows — errors on "packages/app
// not a file" when the symlink resolver returns a directory to a file-read.
//
// Fix: build a staging tree containing only `dist/`, `build/` (icon +
// entitlements), and a sanitized `package.json` with zero declared deps.
// electron-builder's `directories.app` points at this staging tree, so it
// never sees the workspace symlinks at all.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const stage = path.resolve(appRoot, 'release-staging');

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

copyDir(path.join(appRoot, 'dist'), path.join(stage, 'dist'));
copyDir(path.join(appRoot, 'build'), path.join(stage, 'build'));

const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const stagedPkg = {
  name: 'word',
  productName: 'Word',
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  homepage: pkg.homepage,
  license: pkg.license ?? 'UNLICENSED',
  main: 'dist/main/index.cjs',
  // no dependencies / devDependencies / scripts — the bundles are standalone
};
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(stagedPkg, null, 2) + '\n');

console.log(
  `Staged ${path.relative(appRoot, stage)}/ with dist/, build/, and a sanitized package.json (zero deps).`,
);
