#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ANDROID_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(ANDROID_DIR, '..');
const SRC = path.join(ANDROID_DIR, '_runtime_src');
const EXTRACT = path.join(SRC, '_extract');
const OUT = path.join(ANDROID_DIR, 'app', 'src', 'main', 'jniLibs');
const REPO = 'https://packages.termux.dev/apt/termux-main';
const ARCHES = { aarch64: 'arm64-v8a', x86_64: 'x86_64' };

const log = (...x) => console.log('[node-runtime]', ...x);
const fail = (x) => { console.error('[node-runtime] ERROR:', x); process.exit(1); };

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout || r.status}`);
  return r;
}

async function getBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

function parsePackages(text) {
  const map = new Map();
  for (const block of text.split(/\\n\\n+/)) {
    const m = block.match(/^Package:\\s*(\\S+)/m);
    if (!m) continue;
    const rec = {};
    for (const line of block.split(/\\r?\\n/)) {
      const k = line.match(/^([A-Za-z-]+):\\s*(.*)$/);
      if (k) rec[k[1]] = k[2];
    }
    map.set(m[1], rec);
  }
  return map;
}

function extractDeb(deb, work) {
  fs.mkdirSync(work, { recursive: true });
  if (fs.existsSync(path.join(work, 'data', 'data', 'com.termux', 'files', 'usr'))) return;
  sh('tar', ['-xf', path.resolve(deb)], work);
  const data = ['data.tar.xz', 'data.tar.gz', 'data.tar.zst']
    .map(x => path.join(work, x)).find(fs.existsSync);
  if (!data) fail(`找不到 data.tar.*: ${deb}`);
  sh('tar', ['-xf', path.basename(data)], work);
}

function parseElf(buf, label) {
  if (buf.readUInt8(0) !== 0x7f || buf.toString('ascii', 1, 4) !== 'ELF' || buf[4] !== 2 || buf[5] !== 1) {
    fail(`${label}: 不是 ELF64 little-endian`);
  }
  const phoff = Number(buf.readBigUInt64LE(0x20));
  const phentsize = buf.readUInt16LE(0x36);
  const phnum = buf.readUInt16LE(0x38);
  let dyn = null;
  const loads = [];
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    const type = buf.readUInt32LE(o);
    const off = Number(buf.readBigUInt64LE(o + 8));
    const vaddr = Number(buf.readBigUInt64LE(o + 0x10));
    const filesz = Number(buf.readBigUInt64LE(o + 0x20));
    if (type === 1) loads.push({ off, vaddr, filesz });
    if (type === 2) dyn = { off, size: Number(buf.readBigUInt64LE(o + 0x20)) };
  }
  if (!dyn) fail(`${label}: 无 PT_DYNAMIC`);
  const entries = [];
  for (let o = dyn.off; o + 16 <= dyn.off + dyn.size; o += 16) {
    const tag = Number(buf.readBigInt64LE(o));
    if (tag === 0) break;
    entries.push({ tag, val: Number(buf.readBigUInt64LE(o + 8)) });
  }
  const str = entries.find(x => x.tag === 5);
  if (!str) fail(`${label}: 无 DT_STRTAB`);
  const load = loads.find(x => str.val >= x.vaddr && str.val < x.vaddr + x.filesz);
  if (!load) fail(`${label}: DT_STRTAB 不在 PT_LOAD`);
  const strOff = load.off + (str.val - load.vaddr);
  const readStr = n => {
    let a = strOff + n, b = a;
    while (b < buf.length && buf[b] !== 0) b++;
    return buf.toString('utf8', a, b);
  };
  const needed = entries.filter(x => x.tag === 1).map(x => ({ entry:x, name:readStr(x.val) }));
  const soname = entries.find(x => x.tag === 14);
  return { needed, soname: soname ? readStr(soname.val) : null, strOff, entries };
}

function patchElf(buf, label, renames) {
  const info = parseElf(buf, label);
  const rewrite = (name, off) => {
    const next = renames[name];
    if (!next) return name;
    if (next.length > name.length) fail(`${label}: 重命名过长 ${name} -> ${next}`);
    const at = info.strOff + off;
    buf.write(next, at, 'utf8');
    buf.fill(0, at + next.length, at + name.length);
    return next;
  };
  for (const item of info.needed) item.name = rewrite(item.name, item.entry.val);
  if (info.soname) {
    const e = info.entries.find(x => x.tag === 14);
    info.soname = rewrite(info.soname, e.val);
  }
  return info;
}

function findFile(root, re) {
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const s = fs.lstatSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (re.test(n)) return p;
    }
  }
  return null;
}

async function prepareArch(arch, abi) {
  log(`准备 ${arch} -> ${abi}`);
  const indexUrl = `${REPO}/dists/stable/main/binary-${arch}/Packages.gz`;
  const index = parsePackages(zlib.gunzipSync(await getBuffer(indexUrl)).toString('utf8'));
  const packages = ['nodejs-lts', 'libc++', 'openssl', 'c-ares', 'libicu', 'libsqlite', 'zlib'];
  const dir = path.join(SRC, arch);
  fs.mkdirSync(dir, { recursive: true });

  for (const pkg of packages) {
    const rec = index.get(pkg);
    if (!rec) fail(`${arch}: 仓库缺少 ${pkg}`);
    const safe = path.basename(rec.Filename).replace(/:/g, '_');
    const deb = path.join(dir, safe);
    if (!fs.existsSync(deb) || fs.statSync(deb).size === 0) {
      log(`下载 ${pkg} ${rec.Version}`);
      fs.writeFileSync(deb, await getBuffer(REPO + '/' + rec.Filename.replace(/^\\//, '')));
    }
  }

  const roots = {};
  for (const pkg of packages) {
    const work = path.join(EXTRACT, arch, pkg);
    extractDeb(findFile(dir, new RegExp('^' + pkg.replace(/[+]/g, '\\\\+') + '_.*\\\\.deb$')), work);
    roots[pkg] = path.join(work, 'data', 'data', 'com.termux', 'files', 'usr');
  }

  const node = findFile(roots['nodejs-lts'], /^node$/);
  if (!node) fail(`${arch}: nodejs-lts 中找不到 bin/node`);
  const lib = p => findFile(roots[p.pkg], p.re);
  const files = [
    { pkg:'nodejs-lts', re:/^node$/, out:'libnode.so' },
    { pkg:'openssl', re:/^libcrypto\\.so\\./, out:'libcrypto3.so' },
    { pkg:'openssl', re:/^libssl\\.so\\./, out:'libssl3.so' },
    { pkg:'c-ares', re:/^libcares\\.so$/, out:'libcares.so' },
    { pkg:'libicu', re:/^libicui18n\\.so\\./, out:'libicui18n.so' },
    { pkg:'libicu', re:/^libicuuc\\.so\\./, out:'libicuuc.so' },
    { pkg:'libicu', re:/^libicudata\\.so\\./, out:'libicudata.so' },
    { pkg:'libsqlite', re:/^libsqlite3\\.so$/, out:'libsqlite3.so' },
    { pkg:'zlib', re:/^libz\\.so\\./, out:'libz1.so' },
    { pkg:'libc++', re:/^libc\\+\\+_shared\\.so$/, out:'libc++_shared.so' },
  ];

  const renames = {
    'libcrypto.so.3':'libcrypto3.so',
    'libssl.so.3':'libssl3.so',
    'libz.so.1':'libz1.so',
  };
  for (const name of ['libicui18n','libicuuc','libicudata']) {
    const src = findFile(roots['libicu'], new RegExp('^' + name.replace('+','\\+') + '\\.so\\.'));
    if (src) {
      const base = path.basename(src);
      renames[base] = name + '.so';
    }
  }

  const outDir = path.join(OUT, abi);
  fs.rmSync(outDir, { recursive:true, force:true });
  fs.mkdirSync(outDir, { recursive:true });

  const produced = [];
  for (const f of files) {
    const src = f.pkg === 'nodejs-lts' ? node : lib(f);
    if (!src) fail(`${arch}: ${f.pkg} 缺少 ${f.re}`);
    const buf = fs.readFileSync(src);
    patchElf(buf, `${arch}/${path.basename(src)}`, renames);
    fs.writeFileSync(path.join(outDir, f.out), buf);
    produced.push(f.out);
  }

  // 校验 Node 的依赖已全部被打包或由 Android bionic 提供。
  const nodeInfo = parseElf(fs.readFileSync(path.join(outDir, 'libnode.so')), 'libnode.so');
  const available = new Set(produced.concat(['libc.so','libm.so','libdl.so','liblog.so','libandroid.so','libpthread.so','librt.so']));
  const missing = nodeInfo.needed.map(x => x.name).filter(x => !available.has(x));
  if (missing.length) fail(`${arch}: Node 依赖未覆盖: ${missing.join(', ')}`);
  log(`${arch} 完成：${produced.join(', ')}`);
}

async function main() {
  const requested = process.argv[process.argv.indexOf('--arch') + 1];
  const targets = requested && ARCHES[requested] ? [[requested, ARCHES[requested]]] : Object.entries(ARCHES);
  for (const [arch, abi] of targets) await prepareArch(arch, abi);
  log('Node runtime jniLibs 已准备完成。');
}
main().catch(e => fail(e.stack || e.message));
