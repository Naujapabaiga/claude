// Turns a design object into production geometry: print artwork (with bleed)
// and the cut contours. Everything is in the object's local coordinates, with
// the object's own position (x, y) at the origin, so moving an object never
// requires a rebuild.

import { offset, outerOnly, union } from '../geometry/clip';
import {
  applyToPoint,
  flatten,
  multiply,
  ringsBox,
  rotation,
  slant,
  transformPath,
  type Box,
  type Path,
  type Ring,
} from '../geometry/path';
import { layoutText, type FontSet } from '../geometry/text';
import type { DesignObject, LetteringObject, StripeObject, SwatchId } from '../model/types';

export type PrintShape =
  | { kind: 'rings'; rings: Ring[]; color: SwatchId }
  | { kind: 'path'; path: Path; color: SwatchId };

export interface Built {
  /** Print artwork, back to front. */
  print: PrintShape[];
  /** Closed cut contours. Holes are separate rings wound the opposite way. */
  cut: Ring[];
  /** Bounding box of the cut contours (the finished size). */
  box: Box | null;
  /** Characters that the chosen font cannot draw. */
  missing: string[];
}

export interface BuildContext {
  fonts: FontSet;
  bleed: number;
}

function buildLettering(obj: LetteringObject, ctx: BuildContext): Built {
  const font = ctx.fonts[obj.fontId];
  if (!font || obj.text.trim() === '' || obj.capHeight <= 0) {
    return { print: [], cut: [], box: null, missing: [] };
  }
  const layout = layoutText(font, obj.text, obj.capHeight, obj.letterSpacing);
  const matrix = multiply(rotation(obj.rotation), slant(obj.slant));
  const glyphPaths = layout.glyphs.map((g) => transformPath(g, matrix));
  const fillPath: Path = glyphPaths.flat();

  const glyphs = union(glyphPaths.flatMap((g) => flatten(g)));
  const hasOutline = obj.outlineWidth > 0;
  const outline = hasOutline ? offset(glyphs, obj.outlineWidth, obj.corner) : glyphs;

  const print: PrintShape[] = [];
  let cut: Ring[];

  if (obj.cutMode === 'singlePiece') {
    // Grow well past the margin, then shrink back. This bridges the gaps
    // between characters and words so the name stays one sticker, and it
    // smooths the tight notches that are hard to cut and weed.
    const margin = Math.max(0, obj.plateMargin);
    const reach = margin + obj.capHeight * 0.35;
    const plate = outerOnly(offset(offset(outline, reach, 'round'), margin - reach, 'round'));
    cut = plate;
    if (obj.plateColor) {
      print.push({ kind: 'rings', rings: offset(plate, ctx.bleed, 'round'), color: obj.plateColor });
    }
    if (hasOutline) print.push({ kind: 'rings', rings: outline, color: obj.outlineColor });
  } else {
    cut = outline;
    print.push({
      kind: 'rings',
      rings: offset(outline, ctx.bleed, obj.corner),
      color: hasOutline ? obj.outlineColor : obj.fill,
    });
  }
  print.push({ kind: 'path', path: fillPath, color: obj.fill });

  return { print, cut, box: ringsBox(cut), missing: layout.missing };
}

function buildStripe(obj: StripeObject, ctx: BuildContext): Built {
  if (obj.length <= 0 || obj.bandWidth <= 0 || obj.bands < 1) {
    return { print: [], cut: [], box: null, missing: [] };
  }
  const matrix = rotation(obj.rotation);
  const lean = Math.tan((obj.endSlant * Math.PI) / 180);
  const print: PrintShape[] = [];
  const cut: Ring[] = [];
  for (let i = 0; i < Math.floor(obj.bands); i++) {
    const y0 = i * (obj.bandWidth + obj.gap);
    const y1 = y0 + obj.bandWidth;
    // The ends lean forward: the top edge sits further along than the bottom edge.
    const band: Ring = [
      applyToPoint(matrix, -y0 * lean, y0),
      applyToPoint(matrix, obj.length - y0 * lean, y0),
      applyToPoint(matrix, obj.length - y1 * lean, y1),
      applyToPoint(matrix, -y1 * lean, y1),
    ];
    const clean = union([band]);
    cut.push(...clean);
    print.push({ kind: 'rings', rings: offset(clean, ctx.bleed, 'sharp'), color: obj.color });
  }
  // With a negative gap the bands overlap; merge them so cut lines never cross.
  const merged = obj.gap < 0 ? union(cut) : cut;
  return { print, cut: merged, box: ringsBox(merged), missing: [] };
}

export function buildObject(obj: DesignObject, ctx: BuildContext): Built {
  return obj.type === 'lettering' ? buildLettering(obj, ctx) : buildStripe(obj, ctx);
}

/** Cache key covering everything that affects local geometry (not position). */
export function buildKey(obj: DesignObject, bleed: number): string {
  const { x: _x, y: _y, ...rest } = obj;
  return JSON.stringify(rest) + '|' + bleed;
}
