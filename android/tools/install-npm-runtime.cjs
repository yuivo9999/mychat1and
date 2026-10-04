#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ANDROID_DIR = path.resolve(__dirname, '..');
const RUNTIME = path.join(ANDROID_DIR, 'app', 'src', 'main', 'assets', 'node-runtime');
const idx = process.argv.indexOf('--npm-dir');
const explicit = idx >= 0 ? process.argv[idx + 1] : null;

function fail(message) { console.error('[npm-runtime] ERROR:', message); process.exit(1); }
function findNpmDir(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  if (process.env.npm_execpath) candidates.push(path.dirname(path.resolve(process.env.npm_execpath)));
  if (process.execPath) candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'npm'));
  if (process.env.NPM_HOME) candidates.push(path.join(process.env.NPM_HOME, 'node_modules', 'npm'));

  // Node distributions used by CI and package managers commonly install npm
  // under a global prefix rather than next to the node executable.
  try {
    const root = require('node:child_process')
      .execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    if (root) candidates.push(path.join(root, 'npm'));
  } catch {}

  for (const dir of [...new Set(candidates)]) {
    if (fs.existsSync(path.join(dir, 'bin', 'npm-cli.js'))) return dir;
  }
  return null;
}
const source = findNpmDir(explicit);
if (!source) fail('未找到本机 npm。可用 --npm-dir <npm目录> 指定。');
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
fs.rmSync(RUNTIME, { recursive: true, force: true });
fs.mkdirSync(RUNTIME, { recursive: true });
console.log(`[npm-runtime] 打包 npm v${version}`);
fs.cpSync(source, path.join(RUNTIME, 'node_modules', 'npm'), { recursive: true, force: true });
fs.writeFileSync(path.join(RUNTIME, 'manifest.json'), JSON.stringify({ name:'npm', version, root:'node_modules/npm' }, null, 2));
console.log('[npm-runtime] 完成:', RUNTIME);