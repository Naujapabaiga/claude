// Reads an SVG file (for example a sponsor logo) into shape parts, in mm.
// Runs in the browser only: it relies on the browser's own SVG parser.

import paper from 'paper';
import { strokeToRings } from './geometry/clip';
import { fromPaper, initPaper } from './geometry/paperOps';
import { flatten, ringsBox, ringsToPath, transformPath, type Path } from './geometry/path';
import type { ShapePart } from './model/types';

const PX_TO_MM = 25.4 / 96;
const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: PX_TO_MM, '': PX_TO_MM };

function lengthMm(value: string | null): number | null {
  const m = value?.trim().match(/^([0-9.eE+-]+)\s*([a-z%]*)$/);
  if (!m || !(m[2] in UNIT_MM)) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n * UNIT_MM[m[2]] : null;
}

export interface SvgImport {
  parts: ShapePart[];
  width: number;
  height: number;
  /** Things in the file that could not be brought in. */
  notes: string[];
}

function colorHex(color: paper.Color | null): string | null {
  if (!color) return null;
  const solid = color.gradient ? color.gradient.stops[0]?.color : color;
  if (!solid || solid.alpha === 0) return null;
  return solid.toCSS(true).slice(0, 7);
}

export function importSvg(text: string): SvgImport {
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = xml.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || xml.querySelector('parsererror')) {
    throw new Error('This file is not a readable SVG.');
  }

  // Real-world scale: a physical width plus a viewBox gives mm per unit;
  // otherwise SVG units are CSS pixels (96 per inch).
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const widthMm = lengthMm(root.getAttribute('width'));
  const unit = viewBox && viewBox.length === 4 && viewBox[2] > 0 && widthMm ? widthMm / viewBox[2] : PX_TO_MM;

  const notes: string[] = [];
  const texts = root.querySelectorAll('text').length;
  if (texts > 0) notes.push(`${texts} text ${texts === 1 ? 'item was' : 'items were'} skipped; convert text to outlines in the source file`);
  const images = root.querySelectorAll('image').length;
  if (images > 0) notes.push(`${images} embedded ${images === 1 ? 'photo was' : 'photos were'} skipped`);

  // Size attributes are removed so the importer works in plain file units.
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.removeAttribute('viewBox');

  initPaper();
  const item = paper.project.importSVG(new XMLSerializer().serializeToString(root), {
    expandShapes: true,
    insert: false,
  });
  const shapes = item.getItems({
    recursive: true,
    match: (i: paper.Item) =>
      (i instanceof paper.Path || i instanceof paper.CompoundPath) &&
      !(i.parent instanceof paper.CompoundPath) &&
      i.visible &&
      !i.clipMask,
  }) as paper.PathItem[];

  let gradients = 0;
  const raw: ShapePart[] = [];
  for (const shape of shapes) {
    if (shape.fillColor?.gradient || shape.strokeColor?.gradient) gradients++;
    const fill = colorHex(shape.fillColor);
    if (fill) {
      const copy = shape.clone({ insert: false }) as paper.PathItem;
      copy.reorient(shape.fillRule !== 'evenodd', true);
      const path = fromPaper(copy);
      if (path.length > 0) raw.push({ path, color: fill });
    }
    const stroke = colorHex(shape.strokeColor);
    if (stroke && shape.strokeWidth > 0) {
      const pieces = shape instanceof paper.CompoundPath ? (shape.children as paper.Path[]) : [shape as paper.Path];
      for (const piece of pieces) {
        const line = flatten(fromPaper(piece).filter((c) => c.t !== 'Z'), 0.02);
        const points = line.length > 0 ? line : [piece.segments.map((s) => ({ x: s.point.x, y: s.point.y }))];
        const rings = strokeToRings(
          points,
          piece.closed,
          shape.strokeWidth,
          shape.strokeJoin === 'round' ? 'round' : 'sharp',
          shape.strokeCap === 'round' ? 'round' : shape.strokeCap === 'square' ? 'square' : 'butt'
        );
        if (rings.length > 0) raw.push({ path: ringsToPath(rings), color: stroke });
      }
    }
  }
  if (gradients > 0) notes.push(`${gradients} gradient ${gradients === 1 ? 'fill was' : 'fills were'} replaced by a single colour`);
  if (raw.length === 0) throw new Error('No shapes were found in this SVG.');

  const box = ringsBox(raw.flatMap((p) => flatten(p.path, 0.05)));
  if (!box) throw new Error('No shapes were found in this SVG.');
  const toMm = (path: Path) => transformPath(path, [unit, 0, 0, unit, -box.x1 * unit, -box.y1 * unit]);
  return {
    parts: raw.map((p) => ({ path: toMm(p.path), color: p.color })),
    width: (box.x2 - box.x1) * unit,
    height: (box.y2 - box.y1) * unit,
    notes,
  };
}
