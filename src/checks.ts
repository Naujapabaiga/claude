// Pre-export checks. Each one describes a problem in the terms a print shop
// would use and names the object it applies to.

import { FONTS } from './fonts/registry';
import type { DesignObject, Doc } from './model/types';
import { overlapArea } from './geometry/clip';
import { ringArea, ringsBox, translateRings } from './geometry/path';
import type { Built } from './render/build';

export interface Warning {
  objectId: string | null;
  message: string;
}

/** Narrowest printable width assumed for common 137 cm roll printers. */
export const MAX_PIECE_MM = 1300;
/** Below this cap height, individually cut characters tend to lift or tear. */
export const MIN_CUT_CAP_MM = 10;

/** Cut pieces or holes smaller than this are flagged as slivers. */
export const MIN_PIECE_SIZE_MM = 2;
export const MIN_PIECE_AREA_MM2 = 6;

export function objectLabel(obj: DesignObject): string {
  if (obj.type === 'stripe') return `Stripe, ${obj.bands} × ${obj.bandWidth} mm`;
  if (obj.type === 'shape') return `Shape “${obj.name}”`;
  return `${obj.role === 'number' ? 'Number' : 'Name'} “${obj.text}”`;
}

export function runChecks(doc: Doc, built: Map<string, Built>): Warning[] {
  const out: Warning[] = [];
  if (doc.objects.length === 0) out.push({ objectId: null, message: 'The design is empty.' });
  for (const obj of doc.objects) {
    const label = objectLabel(obj);
    const b = built.get(obj.id);
    if (!b || !b.box) {
      out.push({ objectId: obj.id, message: `${label} has nothing to print. Check its text and size.` });
      continue;
    }
    if (b.missing.length > 0) {
      const font = FONTS.find((f) => obj.type === 'lettering' && f.id === obj.fontId)?.name ?? 'This font';
      out.push({
        objectId: obj.id,
        message: `${font} has no character for ${[...new Set(b.missing)].join(' ')}. Pick another font.`,
      });
    }
    const x1 = b.box.x1 + obj.x;
    const y1 = b.box.y1 + obj.y;
    const x2 = b.box.x2 + obj.x;
    const y2 = b.box.y2 + obj.y;
    const reach = doc.bleed;
    if (x1 - reach < 0 || y1 - reach < 0 || x2 + reach > doc.artboard.width || y2 + reach > doc.artboard.height) {
      out.push({ objectId: obj.id, message: `${label} runs past the edge of the sheet and would be cropped.` });
    }
    if (Math.min(x2 - x1, y2 - y1) > MAX_PIECE_MM) {
      out.push({
        objectId: obj.id,
        message: `${label} is wider than ${MAX_PIECE_MM} mm both ways and will not fit a 137 cm roll in one piece.`,
      });
    }
    const slivers = b.cut.filter((ring) => {
      const rb = ringsBox([ring])!;
      return Math.abs(ringArea(ring)) < MIN_PIECE_AREA_MM2 || Math.min(rb.x2 - rb.x1, rb.y2 - rb.y1) < MIN_PIECE_SIZE_MM;
    }).length;
    if (slivers > 0) {
      out.push({
        objectId: obj.id,
        message: `${label} has ${slivers} cut ${slivers === 1 ? 'piece' : 'pieces'} under ${MIN_PIECE_SIZE_MM} mm. They will tear or be lost; adjust spacing or outline width.`,
      });
    }
    if (obj.type === 'lettering' && obj.cutMode === 'perCharacter' && obj.capHeight < MIN_CUT_CAP_MM) {
      out.push({
        objectId: obj.id,
        message: `${label} is under ${MIN_CUT_CAP_MM} mm tall. Characters this small cut poorly one by one; use a single piece.`,
      });
    }
  }
  // Pieces lying on top of each other would be cut through one another.
  const placed = doc.objects
    .map((obj) => ({ obj, b: built.get(obj.id) }))
    .filter((e): e is { obj: DesignObject; b: Built } => !!e.b?.box);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const p = placed[i];
      const q = placed[j];
      const apart =
        p.b.box!.x2 + p.obj.x < q.b.box!.x1 + q.obj.x ||
        q.b.box!.x2 + q.obj.x < p.b.box!.x1 + p.obj.x ||
        p.b.box!.y2 + p.obj.y < q.b.box!.y1 + q.obj.y ||
        q.b.box!.y2 + q.obj.y < p.b.box!.y1 + p.obj.y;
      if (apart) continue;
      const shared = overlapArea(
        translateRings(p.b.cut, p.obj.x, p.obj.y),
        translateRings(q.b.cut, q.obj.x, q.obj.y)
      );
      if (shared > 0.5) {
        out.push({
          objectId: q.obj.id,
          message: `${objectLabel(q.obj)} overlaps ${objectLabel(p.obj)}. Their cut lines cross; move them apart, or unite shapes into one.`,
        });
      }
    }
  }
  return out;
}
