// Combining shapes into a new one (unite, subtract, intersect).

import { combine, uniteAll, type BooleanOp } from './geometry/paperOps';
import { flatten, multiply, ringsBox, transformPath, translatePath, type Matrix, type Path } from './geometry/path';
import { newShape } from './model/defaults';
import type { ShapeObject, ShapePart } from './model/types';
import { shapeMatrix } from './render/build';

/** A shape's parts in sheet coordinates. */
function onSheet(shape: ShapeObject): ShapePart[] {
  const matrix: Matrix = multiply([1, 0, 0, 1, shape.x, shape.y], shapeMatrix(shape));
  return shape.parts.map((p) => ({ path: transformPath(p.path, matrix), color: p.color }));
}

/**
 * Combines shapes given back to front. The back-most shape supplies the
 * colours; the others add to it, cut into it, or mask it.
 */
export function combineShapes(shapes: ShapeObject[], op: BooleanOp): ShapeObject | null {
  if (shapes.length < 2) return null;
  const [base, ...others] = shapes;
  const baseParts = onSheet(base);
  const tool = uniteAll(others.flatMap((s) => onSheet(s).map((p) => p.path)));
  let parts: ShapePart[];
  if (op === 'unite') {
    parts = [{ path: uniteAll([...baseParts.map((p) => p.path), tool]), color: baseParts[0].color }];
  } else {
    parts = baseParts.map((p) => ({ path: combine(p.path, tool, op), color: p.color }));
  }
  parts = parts.filter((p) => flatten(p.path).length > 0);
  if (parts.length === 0) return null;
  const box = ringsBox(parts.flatMap((p) => flatten(p.path)))!;
  const local = parts.map((p) => ({ path: translatePath(p.path, -box.x1, -box.y1) as Path, color: p.color }));
  const result = newShape(base.name, local, box.x1, box.y1);
  return { ...result, cutMode: base.cutMode, plateMargin: base.plateMargin, plateColor: base.plateColor };
}
