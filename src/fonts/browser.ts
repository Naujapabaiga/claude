import opentype from 'opentype.js';
import type { FontSet } from '../geometry/text';
import { FONTS } from './registry';

const urls = import.meta.glob('./files/*.ttf', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>;

export async function loadFonts(): Promise<FontSet> {
  const set: FontSet = {};
  await Promise.all(
    FONTS.map(async (info) => {
      const res = await fetch(urls[`./files/${info.file}`]);
      if (!res.ok) throw new Error(`Could not load the font ${info.name}`);
      set[info.id] = opentype.parse(await res.arrayBuffer());
    })
  );
  return set;
}
