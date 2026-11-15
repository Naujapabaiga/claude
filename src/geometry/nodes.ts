// Point editing on a path: moving anchors and curve handles, adding and
// deleting points. All functions return a new path.

import type { Cmd, Path } from './path';

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Index range [start, end) of the subpath that contains `index`, without its Z. */
function subpath(path: Path, index: number): { start: number; end: number } {
  let start = index;
  while (start > 0 && path[start].t !== 'M') start--;
  let end = index + 1;
  while (end < path.length && path[end].t !== 'M' && path[end].t !== 'Z') end++;
  return { start, end };
}

/**
 * Closed outlines often end with a point on top of their first point. That
 * closing point is kept in step with the first one and never shown on its own.
 */
function closingTwin(path: Path, start: number): number | null {
  const { end } = subpath(path, start);
  const first = path[start];
  const last = path[end - 1];
  if (end - 1 === start || first.t === 'Z' || last.t === 'Z') return null;
  return same(first.x, last.x) && same(first.y, last.y) ? end - 1 : null;
}

export interface Anchor {
  index: number;
  x: number;
  y: number;
}

export function listAnchors(path: Path): Anchor[] {
  const hidden = new Set<number>();
  path.forEach((c, i) => {
    if (c.t === 'M') {
      const twin = closingTwin(path, i);
      if (twin !== null) hidden.add(twin);
    }
  });
  const out: Anchor[] = [];
  path.forEach((c, i) => {
    if (c.t !== 'Z' && !hidden.has(i)) out.push({ index: i, x: c.x, y: c.y });
  });
  return out;
}

export interface Handle {
  /** Command that stores this handle, and which of its two control points. */
  index: number;
  which: 1 | 2;
  x: number;
  y: number;
}

/** The curve handles attached to an anchor (zero, one or two). */
export function handlesOf(path: Path, index: number): Handle[] {
  const out: Handle[] = [];
  const c = path[index];
  if (!c || c.t === 'Z') return out;
  const incoming = c.t === 'M' ? closingTwin(path, index) : index;
  if (incoming !== null) {
    const inc = path[incoming];
    if (inc.t === 'C') out.push({ index: incoming, which: 2, x: inc.x2, y: inc.y2 });
  }
  const next = path[index + 1];
  if (next && next.t === 'C') out.push({ index: index + 1, which: 1, x: next.x1, y: next.y1 });
  return out;
}

function shift(c: Cmd, dx: number, dy: number, parts: { end?: boolean; h1?: boolean; h2?: boolean }): Cmd {
  if (c.t === 'Z') return c;
  const out = { ...c };
  if (parts.end) {
    out.x += dx;
    out.y += dy;
  }
  if (out.t === 'C') {
    if (parts.h1) {
      out.x1 += dx;
      out.y1 += dy;
    }
    if (parts.h2) {
      out.x2 += dx;
      out.y2 += dy;
    }
  }
  return out;
}

/** Moves an anchor to (x, y), carrying its handles along. */
export function moveAnchor(path: Path, index: number, x: number, y: number): Path {
  const c = path[index];
  if (!c || c.t === 'Z') return path;
  const dx = x - c.x;
  const dy = y - c.y;
  const out = [...path];
  out[index] = shift(c, dx, dy, { end: true, h2: true });
  if (out[index + 1]) out[index + 1] = shift(out[index + 1], dx, dy, { h1: true });
  if (c.t === 'M') {
    const twin = closingTwin(path, index);
    if (twin !== null) out[twin] = shift(out[twin], dx, dy, { end: true, h2: true });
  }
  return out;
}

export function moveHandle(path: Path, handle: { index: number; which: 1 | 2 }, x: number, y: number): Path {
  const c = path[handle.index];
  if (!c || c.t !== 'C') return path;
  const out = [...path];
  out[handle.index] = handle.which === 1 ? { ...c, x1: x, y1: y } : { ...c, x2: x, y2: y };
  return out;
}

/** Number of anchors in the subpath that holds `index`. */
function anchorCount(path: Path, index: number): number {
  const { start, end } = subpath(path, index);
  return end - start - (closingTwin(path, start) !== null ? 1 : 0);
}

/** Removes a point. Outlines keep at least three points. */
export function deleteAnchor(path: Path, index: number): Path {
  const c = path[index];
  if (!c || c.t === 'Z' || anchorCount(path, index) <= 3) return path;
  const out = [...path];
  if (c.t === 'M') {
    const next = out[index + 1];
    if (!next || next.t === 'Z') return path;
    const twin = closingTwin(path, index);
    out[index + 1] = { t: 'M', x: next.x, y: next.y };
    if (twin !== null) {
      // The outline now closes onto the new first point.
      const t = out[twin];
      if (t.t !== 'Z') out[twin] = { ...t, x: next.x, y: next.y };
    }
    out.splice(index, 1);
    return out;
  }
  // The segment after the removed point keeps its own end handle and takes
  // over the start handle of the removed segment, so the curve stays smooth.
  const next = out[index + 1];
  if (next && next.t === 'C' && c.t === 'C') out[index + 1] = { ...next, x1: c.x1, y1: c.y1 };
  out.splice(index, 1);
  return out;
}

/** Adds a point halfway along the segment that follows the given anchor. */
export function addPointAfter(path: Path, index: number): { path: Path; index: number } | null {
  const a = path[index];
  if (!a || a.t === 'Z') return null;
  const out = [...path];
  const next = path[index + 1];
  if (!next || next.t === 'Z' || next.t === 'M') {
    // Closing edge: straight line back to the start of the outline.
    const { start } = subpath(path, index);
    const first = path[start];
    if (first.t === 'Z') return null;
    out.splice(index + 1, 0, { t: 'L', x: (a.x + first.x) / 2, y: (a.y + first.y) / 2 });
    return { path: out, index: index + 1 };
  }
  if (next.t === 'L') {
    out.splice(index + 1, 0, { t: 'L', x: (a.x + next.x) / 2, y: (a.y + next.y) / 2 });
    return { path: out, index: index + 1 };
  }
  if (next.t === 'C') {
    // Split the curve at its midpoint (de Casteljau), which leaves its shape unchanged.
    const mid = (p: number, q: number) => (p + q) / 2;
    const ax = mid(a.x, next.x1), ay = mid(a.y, next.y1);
    const bx = mid(next.x1, next.x2), by = mid(next.y1, next.y2);
    const cx = mid(next.x2, next.x), cy = mid(next.y2, next.y);
    const abx = mid(ax, bx), aby = mid(ay, by);
    const bcx = mid(bx, cx), bcy = mid(by, cy);
    const mx = mid(abx, bcx), my = mid(aby, bcy);
    out.splice(
      index + 1,
      1,
      { t: 'C', x1: ax, y1: ay, x2: abx, y2: aby, x: mx, y: my },
      { t: 'C', x1: bcx, y1: bcy, x2: cx, y2: cy, x: next.x, y: next.y }
    );
    return { path: out, index: index + 1 };
  }
  return null;
}
