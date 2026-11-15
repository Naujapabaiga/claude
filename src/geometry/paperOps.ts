// Curve-preserving shape operations, built on Paper.js. Used for combining
// shapes; cut lines and offsets are produced by Clipper instead.

import paper from 'paper';
import { pathToSvg, type Path } from './path';

let ready = false;

export function initPaper(): void {
  if (ready) return;
  paper.setup(new paper.Size(1, 1));
  ready = true;
}

export function toPaper(path: Path): paper.CompoundPath {
  initPaper();
  return new paper.CompoundPath({ pathData: pathToSvg(path), insert: false });
}

export function fromPaper(item: paper.PathItem): Path {
  const out: Path = [];
  const paths = item instanceof paper.CompoundPath ? (item.children as paper.Path[]) : [item as paper.Path];
  for (const p of paths) {
    const segs = p.segments;
    if (segs.length < 2) continue;
    out.push({ t: 'M', x: segs[0].point.x, y: segs[0].point.y });
    const count = p.closed ? segs.length : segs.length - 1;
    for (let i = 0; i < count; i++) {
      const a = segs[i];
      const b = segs[(i + 1) % segs.length];
      const straight = a.handleOut.isZero() && b.handleIn.isZero();
      if (straight) {
        // The closing edge of a straight-sided outline is implied by Z.
        if (i < segs.length - 1) out.push({ t: 'L', x: b.point.x, y: b.point.y });
      } else {
        out.push({
          t: 'C',
          x1: a.point.x + a.handleOut.x,
          y1: a.point.y + a.handleOut.y,
          x2: b.point.x + b.handleIn.x,
          y2: b.point.y + b.handleIn.y,
          x: b.point.x,
          y: b.point.y,
        });
      }
    }
    if (p.closed) out.push({ t: 'Z' });
  }
  return out;
}

export type BooleanOp = 'unite' | 'subtract' | 'intersect';

export function combine(a: Path, b: Path, op: BooleanOp): Path {
  const pa = toPaper(a);
  const pb = toPaper(b);
  const result = pa[op](pb, { insert: false });
  return fromPaper(result);
}

/** Merges several outlines into one silhouette. */
export function uniteAll(paths: Path[]): Path {
  if (paths.length === 0) return [];
  let acc = toPaper(paths[0]);
  acc = acc.unite(acc.clone({ insert: false }), { insert: false }) as paper.CompoundPath;
  for (const p of paths.slice(1)) acc = acc.unite(toPaper(p), { insert: false }) as paper.CompoundPath;
  return fromPaper(acc);
}
