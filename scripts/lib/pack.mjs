// Shared helpers for scripts/build-chrome.mjs and scripts/build-firefox.mjs.
// No dependencies: lists the shippable extension files and writes a plain zip with Node's zlib.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXT = join(ROOT, 'extension');

// Dev-only files that must never ship.
const EXCLUDE_TOP = new Set(['node_modules', 'test', 'package.json', 'package-lock.json']);

/** Shippable files under extension/, as sorted posix paths relative to extension/. */
export function extensionFiles() {
  const out = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const abs = join(dir, name);
      const rel = relative(EXT, abs).split(sep).join('/');
      if (!rel.includes('/') && EXCLUDE_TOP.has(name)) continue;
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(rel);
    }
  };
  walk(EXT);
  return out.sort();
}

export function readManifest() {
  return JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
}

// Fixed timestamp (2026-11-06 00:00) so the same sources give the same zip bytes.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 6;

/** Write a zip. entries: [{ name: 'a/b.js', data: Buffer }]. PNGs are stored, the rest deflated. */
export function writeZip(file, entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const store = /\.(png|jpe?g|gif|webp|zip)$/i.test(name);
    const body = store ? data : deflateRawSync(data, { level: 9 });
    const method = store ? 0 : 8;
    const crc = crc32(data) >>> 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x0314, 4); // made by: unix, 2.0
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([...locals, ...centrals, end]));
  return file;
}
