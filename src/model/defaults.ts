import type { Doc, LetteringObject, StripeObject } from './types';

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
