import type { Swatch, SwatchId } from './types';

export const SWATCHES: Swatch[] = [
  { id: 'black', name: 'Black', rgb: '#1a1a1a', cmyk: [0, 0, 0, 100] },
  { id: 'white', name: 'White', rgb: '#ffffff', cmyk: [0, 0, 0, 0] },
  { id: 'red', name: 'Red', rgb: '#e2231a', cmyk: [0, 100, 100, 0] },
  { id: 'orange', name: 'Orange', rgb: '#f47b20', cmyk: [0, 60, 100, 0] },
  { id: 'yellow', name: 'Yellow', rgb: '#ffe100', cmyk: [0, 5, 100, 0] },
  { id: 'green', name: 'Green', rgb: '#00a651', cmyk: [100, 0, 100, 0] },
  { id: 'blue', name: 'Blue', rgb: '#1f5bb5', cmyk: [100, 70, 0, 0] },
  { id: 'navy', name: 'Navy', rgb: '#14234b', cmyk: [100, 85, 0, 55] },
  { id: 'grey', name: 'Grey', rgb: '#8c9197', cmyk: [0, 0, 0, 50] },
  { id: 'silver', name: 'Silver', rgb: '#c9cdd2', cmyk: [0, 0, 0, 22] },
];

const BY_ID = new Map(SWATCHES.map((s) => [s.id, s]));

/** Plain RGB to CMYK conversion. Good enough for a proof; not colour-managed. */
function hexToCmyk(hex: string): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return [0, 0, 0, 100];
  const f = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 100);
  return [f(r), f(g), f(b), Math.round(k * 100)];
}

export function swatch(id: SwatchId): Swatch {
  const known = BY_ID.get(id);
  if (known) return known;
  if (/^#[0-9a-fA-F]{6}$/.test(id)) return { id, name: id.toUpperCase(), rgb: id, cmyk: hexToCmyk(id) };
  return SWATCHES[0];
}
