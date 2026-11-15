// The design document. Every length is in millimetres at real (1:1) scale.

export type SwatchId = string;

export interface Swatch {
  id: SwatchId;
  name: string;
  /** Screen colour, #rrggbb. */
  rgb: string;
  /** Print colour, each channel 0–100. */
  cmyk: [number, number, number, number];
}

export type Corner = 'round' | 'sharp';
export type CutMode = 'perCharacter' | 'singlePiece';

export interface LetteringObject {
  id: string;
  type: 'lettering';
  role: 'number' | 'name';
  text: string;
  fontId: string;
  /** Height of a capital letter (or digit). */
  capHeight: number;
  /** Extra space between characters. */
  letterSpacing: number;
  /** Forward lean in degrees. */
  slant: number;
  rotation: number;
  /** Left end of the baseline. */
  x: number;
  y: number;
  fill: SwatchId;
  outlineWidth: number;
  outlineColor: SwatchId;
  corner: Corner;
  cutMode: CutMode;
  /** Single-piece mode: distance from the artwork to the cut edge. */
  plateMargin: number;
  /** Single-piece mode: background colour, or null for unprinted vinyl. */
  plateColor: SwatchId | null;
}

export interface StripeObject {
  id: string;
  type: 'stripe';
  /** Top-left corner of the first band, before rotation. */
  x: number;
  y: number;
  length: number;
  rotation: number;
  bands: number;
  bandWidth: number;
  gap: number;
  /** Angle of the band ends in degrees; 0 is square-cut. */
  endSlant: number;
  color: SwatchId;
}

export interface ShapePart {
  /** Outline in the shape's own coordinates, in mm at natural size. */
  path: import('../geometry/path').Path;
  /** A palette swatch id, or any colour as #rrggbb. */
  color: string;
}

export interface ShapeObject {
  id: string;
  type: 'shape';
  name: string;
  /** Where the shape's own origin sits on the sheet. */
  x: number;
  y: number;
  rotation: number;
  /** Stretch applied to the natural size. */
  sx: number;
  sy: number;
  lockRatio: boolean;
  /** Back to front. */
  parts: ShapePart[];
  cutMode: 'contour' | 'singlePiece';
  plateMargin: number;
  plateColor: SwatchId | null;
}

export type DesignObject = LetteringObject | StripeObject | ShapeObject;

export interface Doc {
  version: 1;
  name: string;
  artboard: { width: number; height: number };
  /** How far print artwork extends past each cut line. */
  bleed: number;
  /** Spot colour name the cutter software looks for. */
  cutName: string;
  objects: DesignObject[];
}
