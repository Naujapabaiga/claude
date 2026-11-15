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

export function swatch(id: SwatchId): Swatch {
  return BY_ID.get(id) ?? SWATCHES[0];
}
