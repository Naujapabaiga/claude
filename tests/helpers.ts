import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { FONTS } from '../src/fonts/registry';
import type { FontSet } from '../src/geometry/text';
import type { Doc } from '../src/model/types';
import { buildObject, type Built } from '../src/render/build';

export function loadFontsFromDisk(): FontSet {
  const set: FontSet = {};
  for (const info of FONTS) {
    const file = fileURLToPath(new URL(`../src/fonts/files/${info.file}`, import.meta.url));
    const buf = readFileSync(file);
    set[info.id] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return set;
}

export function buildAll(doc: Doc, fonts: FontSet): Map<string, Built> {
  return new Map(doc.objects.map((o) => [o.id, buildObject(o, { fonts, bleed: doc.bleed })]));
}
