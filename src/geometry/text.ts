// Turns text into outlines. One glyph per character with pair kerning; the
// result has no dependency on the font file, so exports never need fonts.

import type { Font } from 'opentype.js';
import type { Cmd, Path } from './path';

export type FontSet = Record<string, Font>;

const capRatioCache = new WeakMap<Font, number>();

/** Capital-letter height as a fraction of the font size, measured from "H". */
function capRatio(font: Font): number {
  let ratio = capRatioCache.get(font);
  if (ratio === undefined) {
    const box = font.charToGlyph('H').getPath(0, 0, 1).getBoundingBox();
    ratio = box.y2 - box.y1 || 0.7;
    capRatioCache.set(font, ratio);
  }
  return ratio;
}

export interface TextLayout {
  /** One outline per visible character, baseline on y = 0, starting at x = 0. */
  glyphs: Path[];
  /** Characters the font has no glyph for. */
  missing: string[];
}

export function layoutText(font: Font, text: string, capHeight: number, letterSpacing: number): TextLayout {
  const size = capHeight / capRatio(font);
  const scale = size / font.unitsPerEm;
  const chars = [...text];
  const glyphs = chars.map((ch) => font.charToGlyph(ch));
  const out: Path[] = [];
  const missing: string[] = [];
  let pen = 0;
  glyphs.forEach((glyph, i) => {
    if (glyph.index === 0 && chars[i].trim() !== '') missing.push(chars[i]);
    const commands = glyph.getPath(pen, 0, size).commands;
    if (commands.length > 0) {
      out.push(
        commands.map((c): Cmd => {
          if (c.type === 'M') return { t: 'M', x: c.x!, y: c.y! };
          if (c.type === 'L') return { t: 'L', x: c.x!, y: c.y! };
          if (c.type === 'Q') return { t: 'Q', x1: c.x1!, y1: c.y1!, x: c.x!, y: c.y! };
          if (c.type === 'C') return { t: 'C', x1: c.x1!, y1: c.y1!, x2: c.x2!, y2: c.y2!, x: c.x!, y: c.y! };
          return { t: 'Z' };
        })
      );
    }
    pen += (glyph.advanceWidth || 0) * scale + letterSpacing;
    if (i < glyphs.length - 1) pen += (font.getKerningValue(glyph, glyphs[i + 1]) || 0) * scale;
  });
  return { glyphs: out, missing };
}
