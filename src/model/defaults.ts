import type { Path } from '../geometry/path';
import type { Doc, LetteringObject, ShapeObject, ShapePart, StripeObject } from './types';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newNumber(x: number, y: number): LetteringObject {
  return {
    id: newId(),
    type: 'lettering',
    role: 'number',
    text: '27',
    fontId: 'russo-one',
    capHeight: 250,
    letterSpacing: 0,
    slant: 10,
    rotation: 0,
    x,
    y,
    fill: 'yellow',
    outlineWidth: 12,
    outlineColor: 'black',
    corner: 'sharp',
    cutMode: 'perCharacter',
    plateMargin: 10,
    plateColor: 'white',
  };
}

export function newName(x: number, y: number): LetteringObject {
  return {
    id: newId(),
    type: 'lettering',
    role: 'name',
    text: 'V. PAVARDENIS',
    fontId: 'saira-condensed',
    capHeight: 45,
    letterSpacing: 1,
    slant: 8,
    rotation: 0,
    x,
    y,
    fill: 'black',
    outlineWidth: 0,
    outlineColor: 'white',
    corner: 'round',
    cutMode: 'perCharacter',
    plateMargin: 6,
    plateColor: 'white',
  };
}

export function newStripe(x: number, y: number): StripeObject {
  return {
    id: newId(),
    type: 'stripe',
    x,
    y,
    length: 1000,
    rotation: 0,
    bands: 2,
    bandWidth: 40,
    gap: 12,
    endSlant: 25,
    color: 'red',
  };
}

export function newShape(name: string, parts: ShapePart[], x: number, y: number): ShapeObject {
  return {
    id: newId(),
    type: 'shape',
    name,
    x,
    y,
    rotation: 0,
    sx: 1,
    sy: 1,
    lockRatio: false,
    parts,
    cutMode: 'contour',
    plateMargin: 5,
    plateColor: 'white',
  };
}

export function newRectangle(x: number, y: number): ShapeObject {
  const path: Path = [
    { t: 'M', x: 0, y: 0 },
    { t: 'L', x: 200, y: 0 },
    { t: 'L', x: 200, y: 120 },
    { t: 'L', x: 0, y: 120 },
    { t: 'Z' },
  ];
  return newShape('Rectangle', [{ path, color: 'blue' }], x, y);
}

export function newEllipse(x: number, y: number): ShapeObject {
  const r = 80;
  const k = r * 0.5522847498; // handle length that makes four curves a circle
  const path: Path = [
    { t: 'M', x: r, y: 0 },
    { t: 'C', x1: r + k, y1: 0, x2: 2 * r, y2: r - k, x: 2 * r, y: r },
    { t: 'C', x1: 2 * r, y1: r + k, x2: r + k, y2: 2 * r, x: r, y: 2 * r },
    { t: 'C', x1: r - k, y1: 2 * r, x2: 0, y2: r + k, x: 0, y: r },
    { t: 'C', x1: 0, y1: r - k, x2: r - k, y2: 0, x: r, y: 0 },
    { t: 'Z' },
  ];
  return newShape('Circle', [{ path, color: 'orange' }], x, y);
}

export function newDoc(): Doc {
  return {
    version: 1,
    name: 'Untitled livery',
    artboard: { width: 1200, height: 600 },
    bleed: 2,
    cutName: 'CutContour',
    objects: [newStripe(80, 440), newNumber(120, 340), newName(560, 330)],
  };
}
