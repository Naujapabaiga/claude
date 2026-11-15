// Pre-export checks. Each one describes a problem in the terms a print shop
// would use and names the object it applies to.

import { FONTS } from './fonts/registry';
import type { DesignObject, Doc } from './model/types';
import type { Built } from './render/build';

export interface Warning {
  objectId: string | null;
  message: string;
}

/** Narrowest printable width assumed for common 137 cm roll printers. */
export const MAX_PIECE_MM = 1300;
/** Below this cap height, individually cut characters tend to lift or tear. */
export const MIN_CUT_CAP_MM = 10;

export function objectLabel(obj: DesignObject): string {
  if (obj.type === 'stripe') return `Stripe, ${obj.bands} × ${obj.bandWidth} mm`;
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
    if (obj.type === 'lettering' && obj.cutMode === 'perCharacter' && obj.capHeight < MIN_CUT_CAP_MM) {
      out.push({
        objectId: obj.id,
        message: `${label} is under ${MIN_CUT_CAP_MM} mm tall. Characters this small cut poorly one by one; use a single piece.`,
      });
    }
  }
  return out;
}
