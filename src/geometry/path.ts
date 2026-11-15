// Vector primitives: curve paths, flattened rings, and affine transforms.

export interface Point {
  x: number;
  y: number;
}

/** A closed polygon. The last point connects back to the first. */
export type Ring = Point[];

export type Cmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'Q'; x1: number; y1: number; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

export type Path = Cmd[];

/** Affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function rotation(deg: number): Matrix {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, s, -s, c, 0, 0];
}

/** Forward lean: points above the baseline (negative y) move right. */
export function slant(deg: number): Matrix {
  return [1, 0, -Math.tan(rad(deg)), 1, 0, 0];
}

export function applyToPoint(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function transformPath(path: Path, m: Matrix): Path {
  return path.map((c): Cmd => {
    if (c.t === 'Z') return c;
    const p = applyToPoint(m, c.x, c.y);
    if (c.t === 'M' || c.t === 'L') return { t: c.t, x: p.x, y: p.y };
    const p1 = applyToPoint(m, c.x1, c.y1);
    if (c.t === 'Q') return { t: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
    const p2 = applyToPoint(m, c.x2, c.y2);
    return { t: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
  });
}

export function translatePath(path: Path, dx: number, dy: number): Path {
  return transformPath(path, [1, 0, 0, 1, dx, dy]);
}

export function translateRings(rings: Ring[], dx: number, dy: number): Ring[] {
  return rings.map((r) => r.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

/**
 * Converts curves to straight segments. `tolerance` is the largest allowed gap
 * between the true curve and the segments, in mm.
 */
export function flatten(path: Path, tolerance = 0.01): Ring[] {
  const rings: Ring[] = [];
  let ring: Ring = [];
  let cur: Point = { x: 0, y: 0 };
  const finish = () => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  for (const c of path) {
    if (c.t === 'M') {
      finish();
      cur = { x: c.x, y: c.y };
      ring.push(cur);
    } else if (c.t === 'L') {
      cur = { x: c.x, y: c.y };
      ring.push(cur);
    } else if (c.t === 'Q') {
      const dd = Math.hypot(cur.x - 2 * c.x1 + c.x, cur.y - 2 * c.y1 + c.y);
      const n = Math.max(1, Math.ceil(Math.sqrt(dd / (4 * tolerance))));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        ring.push({
          x: u * u * cur.x + 2 * u * t * c.x1 + t * t * c.x,
          y: u * u * cur.y + 2 * u * t * c.y1 + t * t * c.y,
        });
      }
      cur = { x: c.x, y: c.y };
    } else if (c.t === 'C') {
      const d1 = Math.hypot(cur.x - 2 * c.x1 + c.x2, cur.y - 2 * c.y1 + c.y2);
      const d2 = Math.hypot(c.x1 - 2 * c.x2 + c.x, c.y1 - 2 * c.y2 + c.y);
      const n = Math.max(1, Math.ceil(Math.sqrt((3 * Math.max(d1, d2)) / (4 * tolerance))));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        ring.push({
          x: u * u * u * cur.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          y: u * u * u * cur.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        });
      }
      cur = { x: c.x, y: c.y };
    } else {
      finish();
    }
  }
  finish();
  return rings;
}

export function ringsBox(rings: Ring[]): Box | null {
  let box: Box | null = null;
  for (const r of rings) {
    for (const p of r) {
      if (!box) box = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      else {
        if (p.x < box.x1) box.x1 = p.x;
        if (p.y < box.y1) box.y1 = p.y;
        if (p.x > box.x2) box.x2 = p.x;
        if (p.y > box.y2) box.y2 = p.y;
      }
    }
  }
  return box;
}

/** Signed area; the sign tells outer contours from holes. */
export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const fmt = (v: number) => {
  const s = v.toFixed(3);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

export function pathToSvg(path: Path): string {
  let d = '';
  for (const c of path) {
    if (c.t === 'M') d += `M${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.t === 'L') d += `L${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.t === 'Q') d += `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.t === 'C') d += `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
    else d += 'Z';
  }
  return d;
}

export function ringsToSvg(rings: Ring[]): string {
  let d = '';
  for (const r of rings) {
    r.forEach((p, i) => {
      d += `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`;
    });
    d += 'Z';
  }
  return d;
}
