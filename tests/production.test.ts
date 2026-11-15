import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/checks';
import { buildPdf } from '../src/export/pdf';
import { place } from '../src/export/placed';
import { buildSvg } from '../src/export/svg';
import { FONTS } from '../src/fonts/registry';
import { offset, union } from '../src/geometry/clip';
import { ringArea, ringsBox, type Ring } from '../src/geometry/path';
import { newDoc, newName, newNumber, newStripe } from '../src/model/defaults';
import { buildObject } from '../src/render/build';
import { buildAll, loadFontsFromDisk } from './helpers';

const fonts = loadFontsFromDisk();
const ctx = { fonts, bleed: 2 };
const totalArea = (rings: Ring[]) => rings.reduce((sum, r) => sum + ringArea(r), 0);
const absArea = (rings: Ring[]) => rings.reduce((sum, r) => sum + Math.abs(ringArea(r)), 0);

describe('geometry', () => {
  const square: Ring = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('offsets a square exactly with sharp corners', () => {
    const grown = offset([square], 2, 'sharp');
    expect(grown).toHaveLength(1);
    expect(Math.abs(ringArea(grown[0]))).toBeCloseTo(104 * 104, 1);
  });

  it('keeps round corners within 0.005 mm of a true arc', () => {
    const grown = offset([square], 2, 'round');
    const exact = 100 * 100 + 4 * 100 * 2 + Math.PI * 4;
    // A polygon inside a 2 mm arc that strays at most 5 µm loses under 0.07 mm² in total.
    expect(Math.abs(ringArea(grown[0]))).toBeGreaterThan(exact - 0.07);
    expect(Math.abs(ringArea(grown[0]))).toBeLessThanOrEqual(exact + 0.001);
  });

  it('merges overlapping shapes', () => {
    const shifted = square.map((p) => ({ x: p.x + 50, y: p.y }));
    const merged = union([square, shifted]);
    expect(merged).toHaveLength(1);
    expect(Math.abs(ringArea(merged[0]))).toBeCloseTo(150 * 100, 3);
  });
});

describe('lettering', () => {
  it('makes characters exactly the requested height in every font', () => {
    for (const font of FONTS) {
      const obj = { ...newNumber(0, 0), text: 'H', fontId: font.id, capHeight: 200, slant: 0, outlineWidth: 0 };
      const box = buildObject(obj, ctx).box!;
      expect(box.y2 - box.y1, font.name).toBeCloseTo(200, 1);
    }
  });

  it('cuts each character on its own outline, including inner holes', () => {
    const obj = { ...newNumber(0, 0), text: '08', outlineWidth: 0, slant: 0 };
    const built = buildObject(obj, ctx);
    const outers = built.cut.filter((r) => ringArea(r) * totalArea(built.cut) > 0);
    expect(outers).toHaveLength(2);
    expect(built.cut.length - outers.length).toBe(3); // one hole in 0, two in 8
  });

  it('places the cut line at the outer edge of the outline', () => {
    const base = { ...newNumber(0, 0), text: 'H', slant: 0, corner: 'round' as const };
    const plain = buildObject({ ...base, outlineWidth: 0 }, ctx).box!;
    const outlined = buildObject({ ...base, outlineWidth: 12 }, ctx).box!;
    expect(outlined.x2 - outlined.x1).toBeCloseTo(plain.x2 - plain.x1 + 24, 1);
    expect(outlined.y2 - outlined.y1).toBeCloseTo(plain.y2 - plain.y1 + 24, 1);
  });

  it('extends print artwork past the cut line by the bleed', () => {
    const built = buildObject({ ...newNumber(0, 0), text: 'H', slant: 0, corner: 'round' }, ctx);
    const under = built.print[0];
    expect(under.kind).toBe('rings');
    if (under.kind !== 'rings') return;
    const printBox = ringsBox(under.rings)!;
    expect(printBox.x1).toBeCloseTo(built.box!.x1 - 2, 2);
    expect(printBox.y2).toBeCloseTo(built.box!.y2 + 2, 2);
  });

  it('gives a single-piece name one cut contour with no holes', () => {
    const obj = { ...newName(0, 0), text: 'ŠARŪNAS 08', cutMode: 'singlePiece' as const };
    const built = buildObject(obj, ctx);
    expect(built.cut).toHaveLength(1);
    expect(built.missing).toEqual([]);
  });

  it('supports every Lithuanian letter in every font', () => {
    for (const font of FONTS) {
      const obj = { ...newName(0, 0), text: 'ĄČĘĖĮŠŲŪŽ', fontId: font.id };
      expect(buildObject(obj, ctx).missing, font.name).toEqual([]);
    }
  });

  it('never produces overlapping cut lines, even with a thick outline', () => {
    const obj = { ...newNumber(0, 0), text: '888', outlineWidth: 30, letterSpacing: -20 };
    const cut = buildObject(obj, ctx).cut;
    const merged = union(cut);
    expect(merged).toHaveLength(cut.length);
    expect(absArea(merged)).toBeCloseTo(absArea(cut), 0);
  });
});

describe('stripes', () => {
  it('cuts one band per stripe at the exact size', () => {
    const obj = { ...newStripe(0, 0), bands: 3, bandWidth: 40, gap: 10, length: 1000, endSlant: 0 };
    const built = buildObject(obj, ctx);
    expect(built.cut).toHaveLength(3);
    for (const band of built.cut) expect(Math.abs(ringArea(band))).toBeCloseTo(40 * 1000, 3);
    expect(built.box!.y2 - built.box!.y1).toBeCloseTo(3 * 40 + 2 * 10, 3);
  });

  it('keeps band area when the ends are angled', () => {
    const built = buildObject({ ...newStripe(0, 0), endSlant: 30 }, ctx);
    for (const band of built.cut) expect(Math.abs(ringArea(band))).toBeCloseTo(40 * 1000, 3);
  });
});

describe('export', () => {
  const doc = newDoc();
  const built = buildAll(doc, fonts);
  const placed = place(doc.objects, built);
  const outDir = fileURLToPath(new URL('./out/', import.meta.url));
  mkdirSync(outDir, { recursive: true });

  it('writes a PDF at real size with the cut line as a spot colour', () => {
    const pdf = buildPdf(doc, placed);
    writeFileSync(outDir + 'sample.pdf', pdf);
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-1.6')).toBe(true);
    expect(text).toContain('/Separation /CutContour /DeviceCMYK');
    // 1200 × 600 mm in points
    expect(text).toContain('/MediaBox [0 0 3401.575 1700.787]');
    expect(text).not.toContain('/Font');
    // every cross-reference entry must point at its object
    const xref = text.slice(text.lastIndexOf('xref'));
    const offsets = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((off, i) => expect(text.slice(off, off + 8)).toBe(`${i + 1} 0 obj\n`));
    // one stroked path per cut contour
    expect((text.match(/\nS\n/g) ?? []).length).toBe(placed.cut.length);
  });

  it('honours a custom cut colour name', () => {
    const text = Buffer.from(buildPdf({ ...doc, cutName: 'Thru-cut 1' }, placed)).toString('latin1');
    expect(text).toContain('/Separation /Thru-cut#201 /DeviceCMYK');
  });

  it('writes an SVG sized in millimetres', () => {
    const svg = buildSvg(doc, placed);
    writeFileSync(outDir + 'sample.svg', svg);
    expect(svg).toContain('width="1200mm" height="600mm" viewBox="0 0 1200 600"');
    expect(svg).toContain('id="CutContour"');
  });

  it('passes its own checks for the starter design', () => {
    expect(runChecks(doc, built)).toEqual([]);
  });

  it('warns when artwork leaves the sheet', () => {
    const moved = { ...doc, objects: [{ ...doc.objects[0], x: -500 }] };
    const warnings = runChecks(moved, buildAll(moved, fonts));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('past the edge');
  });
});
