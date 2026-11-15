// Polygon union and offset, built on Clipper. Clipper works on integers, so
// millimetres are scaled to micrometres on the way in and back on the way out.

import ClipperLib from 'clipper-lib';
import type { Corner } from '../model/types';
import { ringArea, type Ring } from './path';

const SCALE = 1000;
/** Rings smaller than this (mm²) are numerical dust and are dropped. */
const MIN_AREA = 0.005;

type ClipperPath = { X: number; Y: number }[];

function toClipper(rings: Ring[]): ClipperPath[] {
  return rings.map((r) => r.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })));
}

function fromClipper(paths: ClipperPath[]): Ring[] {
  return paths
    .map((p) => p.map((q) => ({ x: q.X / SCALE, y: q.Y / SCALE })))
    .filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= MIN_AREA);
}

function unionClipper(paths: ClipperPath[]): ClipperPath[] {
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    out,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );
  return out;
}

/** Merges overlapping shapes into clean, non-overlapping outlines. */
export function union(rings: Ring[]): Ring[] {
  if (rings.length === 0) return [];
  return fromClipper(unionClipper(toClipper(rings)));
}

/** Grows (or, with a negative distance, shrinks) shapes by `distance` mm. */
export function offset(rings: Ring[], distance: number, corner: Corner): Ring[] {
  if (rings.length === 0) return [];
  if (distance === 0) return union(rings);
  const clean = unionClipper(toClipper(rings));
  // Arc tolerance 5 µm keeps rounded corners smooth without flooding the cutter with points.
  const co = new ClipperLib.ClipperOffset(4, 5);
  co.AddPaths(
    clean,
    corner === 'round' ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon
  );
  const out = new ClipperLib.Paths();
  co.Execute(out, distance * SCALE);
  return fromClipper(unionClipper(out));
}

/** Drops holes, keeping only the outer contour of each shape. */
export function outerOnly(rings: Ring[]): Ring[] {
  const merged = unionClipper(toClipper(rings));
  return fromClipper(merged.filter((p) => ClipperLib.Clipper.Orientation(p)));
}
