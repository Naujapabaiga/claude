import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/checks';
import { addPointAfter, deleteAnchor, handlesOf, listAnchors, moveAnchor } from '../src/geometry/nodes';
import { flatten, ringArea, ringsBox, type Ring } from '../src/geometry/path';
import { newDoc, newEllipse, newRectangle } from '../src/model/defaults';
import { buildObject } from '../src/render/build';
import { combineShapes } from '../src/shapes';
import { swatch } from '../src/model/swatches';
import { buildAll, loadFontsFromDisk } from './helpers';

const fonts = loadFontsFromDisk();
const ctx = { fonts, bleed: 2 };
const area = (rings: Ring[]) => Math.abs(rings.reduce((s, r) => s + ringArea(r), 0));
const shapeArea = (shape: ReturnType<typeof newRectangle>) => area(shape.parts.flatMap((p) => flatten(p.path, 0.001)));

describe('shapes', () => {
  it('builds a rectangle with an exact cut line and bleed', () => {
    const built = buildObject(newRectangle(0, 0), ctx);
    expect(built.cut).toHaveLength(1);
    expect(area(built.cut)).toBeCloseTo(200 * 120, 3);
    const first = built.print[0];
    expect(first.kind === 'rings' && ringsBox(first.rings)!.x1).toBeCloseTo(-2, 3);
  });

  it('scales and keeps the circle round to within 0.01 mm', () => {
    const circle = { ...newEllipse(0, 0), sx: 2, sy: 2 };
    const built = buildObject(circle, ctx);
    const box = built.box!;
    expect(box.x2 - box.x1).toBeCloseTo(320, 2);
    // The four-curve circle is itself within 0.03 % of a true circle.
    expect(area(built.cut)).toBeGreaterThan(Math.PI * 160 * 160 * 0.999);
    expect(area(built.cut)).toBeLessThan(Math.PI * 160 * 160 * 1.001);
  });

  it('converts any screen colour for print', () => {
    expect(swatch('#ff0000').cmyk).toEqual([0, 100, 100, 0]);
    expect(swatch('#000000').cmyk).toEqual([0, 0, 0, 100]);
    expect(swatch('#ffffff').cmyk).toEqual([0, 0, 0, 0]);
  });
});

describe('combining shapes', () => {
  const back = newRectangle(0, 0); // 200 × 120
  const front = { ...newRectangle(100, 60), parts: [{ ...newRectangle(0, 0).parts[0], color: 'red' }] };

  it('unites into one outline', () => {
    const result = combineShapes([back, front], 'unite')!;
    expect(result.parts).toHaveLength(1);
    expect(shapeArea(result)).toBeCloseTo(2 * 200 * 120 - 100 * 60, 2);
    expect(result.parts[0].color).toBe('blue');
    expect([result.x, result.y]).toEqual([0, 0]);
  });

  it('subtracts the front shape from the back one', () => {
    const result = combineShapes([back, front], 'subtract')!;
    expect(shapeArea(result)).toBeCloseTo(200 * 120 - 100 * 60, 2);
  });

  it('intersects', () => {
    const result = combineShapes([back, front], 'intersect')!;
    expect(shapeArea(result)).toBeCloseTo(100 * 60, 2);
    expect([result.x, result.y]).toEqual([100, 60]);
  });

  it('keeps true curves when a circle is cut', () => {
    // A tall rectangle covering the right half of the circle.
    const result = combineShapes([newEllipse(0, 0), { ...newRectangle(80, -10), sy: 2 }], 'subtract')!;
    expect(result.parts[0].path.some((c) => c.t === 'C')).toBe(true);
    expect(shapeArea(result)).toBeCloseTo((Math.PI * 80 * 80) / 2, -1);
  });

  it('reports when nothing is left', () => {
    expect(combineShapes([newRectangle(0, 0), newRectangle(500, 500)], 'intersect')).toBeNull();
  });
});

describe('point editing', () => {
  const circle = newEllipse(0, 0).parts[0].path;
  const rect = newRectangle(0, 0).parts[0].path;

  it('shows each point once, even where an outline closes on itself', () => {
    expect(listAnchors(circle)).toHaveLength(4);
    expect(listAnchors(rect)).toHaveLength(4);
  });

  it('gives a curve point two handles and a corner none', () => {
    expect(handlesOf(circle, 0)).toHaveLength(2);
    expect(handlesOf(circle, 2)).toHaveLength(2);
    expect(handlesOf(rect, 1)).toHaveLength(0);
  });

  it('moves the first point together with the closing point and handles', () => {
    const moved = moveAnchor(circle, 0, 80, -40);
    const first = moved[0];
    const last = moved[4];
    expect(first.t === 'M' && [first.x, first.y]).toEqual([80, -40]);
    expect(last.t === 'C' && [last.x, last.y]).toEqual([80, -40]);
    const before = circle[4];
    expect(last.t === 'C' && before.t === 'C' && last.y2 - before.y2).toBeCloseTo(-40, 6);
    expect(flatten(moved)).toHaveLength(1);
  });

  it('adds a point on a curve without changing its shape', () => {
    const added = addPointAfter(circle, 0)!;
    expect(listAnchors(added.path)).toHaveLength(5);
    expect(area(flatten(added.path, 0.001))).toBeCloseTo(area(flatten(circle, 0.001)), 1);
  });

  it('adds a point on the closing edge of a rectangle', () => {
    const added = addPointAfter(rect, 3)!;
    const p = added.path[added.index];
    expect(p.t === 'L' && [p.x, p.y]).toEqual([0, 60]);
  });

  it('deletes points but never below three', () => {
    const three = deleteAnchor(rect, 2);
    expect(listAnchors(three)).toHaveLength(3);
    expect(deleteAnchor(three, 1)).toBe(three);
    const withoutFirst = deleteAnchor(circle, 0);
    expect(listAnchors(withoutFirst)).toHaveLength(3);
    expect(flatten(withoutFirst)).toHaveLength(1);
  });
});

describe('sliver check', () => {
  it('flags cut pieces too small to survive cutting', () => {
    const speck = { ...newRectangle(100, 100), sx: 0.006, sy: 0.01 }; // 1.2 × 1.2 mm
    const doc = { ...newDoc(), objects: [speck] };
    const warnings = runChecks(doc, buildAll(doc, fonts));
    expect(warnings.some((w) => w.message.includes('under 2 mm'))).toBe(true);
  });

  it('flags pieces whose cut lines cross', () => {
    const doc = { ...newDoc(), objects: [newRectangle(100, 100), newRectangle(250, 150)] };
    const warnings = runChecks(doc, buildAll(doc, fonts));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('overlaps');
    const apart = { ...doc, objects: [newRectangle(100, 100), newRectangle(400, 100)] };
    expect(runChecks(apart, buildAll(apart, fonts))).toEqual([]);
  });

  it('stays quiet for the starter design', () => {
    const doc = newDoc();
    expect(runChecks(doc, buildAll(doc, fonts))).toEqual([]);
  });
});
