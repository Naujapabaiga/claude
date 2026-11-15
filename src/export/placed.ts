// Geometry moved from each object's local coordinates onto the artboard.

import { translatePath, translateRings, type Ring } from '../geometry/path';
import type { DesignObject } from '../model/types';
import type { Built, PrintShape } from '../render/build';

export interface Placed {
  print: PrintShape[];
  cut: Ring[];
}

export function place(objects: DesignObject[], built: Map<string, Built>): Placed {
  const print: PrintShape[] = [];
  const cut: Ring[] = [];
  for (const obj of objects) {
    const b = built.get(obj.id);
    if (!b) continue;
    for (const shape of b.print) {
      print.push(
        shape.kind === 'rings'
          ? { kind: 'rings', rings: translateRings(shape.rings, obj.x, obj.y), color: shape.color }
          : { kind: 'path', path: translatePath(shape.path, obj.x, obj.y), color: shape.color }
      );
    }
    cut.push(...translateRings(b.cut, obj.x, obj.y));
  }
  return { print, cut };
}
