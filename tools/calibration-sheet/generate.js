// Calibration sheet generator.
// Produces a 600 x 320 mm, 1:1, fully vector PDF: CMYK print artwork plus cut
// lines in the spot colour "CutContour". All text is converted to outlines.
//
// Usage: node generate.js [output.pdf]

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const opentype = require('opentype.js');

const OUT = process.argv[2] || path.join(__dirname, 'calibration-sheet-v1.pdf');
const FONT_DIR = '/usr/share/fonts/truetype/dejavu';
const MM = 72 / 25.4; // points per millimetre
const PAGE_W = 600;
const PAGE_H = 320;
const CUT_NAME = 'CutContour';
const CUT_WIDTH = 0.25 / MM; // 0.25 pt hairline, expressed in mm

const BLACK = [0, 0, 0, 100];
const GREY = [0, 0, 0, 45];
const RED = [0, 100, 100, 0];
const BLUE = [100, 70, 0, 0];

function loadFont(file) {
  const buf = fs.readFileSync(path.join(FONT_DIR, file));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const fonts = { regular: loadFont('DejaVuSans.ttf'), bold: loadFont('DejaVuSans-Bold.ttf') };

// Font size (mm) that gives the requested capital-letter height (mm).
// Cap height is measured from the flat-topped letter "H" rather than read from
// font metadata, which is missing in some fonts.
function sizeForCap(font, capH) {
  const h = font.charToGlyph('H').getBoundingBox();
  return capH / ((h.y2 - h.y1) / font.unitsPerEm);
}

const doc = new PDFDocument({
  size: [PAGE_W * MM, PAGE_H * MM],
  margin: 0,
  autoFirstPage: true,
  info: { Title: 'Calibration sheet v1 (600 x 320 mm, print at 100%)' },
});
doc.pipe(fs.createWriteStream(OUT));
doc.addSpotColor(CUT_NAME, 0, 100, 0, 0);
doc.scale(MM); // from here on, every coordinate and line width is in millimetres

// Simple left-to-right layout: one glyph per character plus pair kerning.
// (Bypasses the font's advanced substitution features, which are not needed here.)
function layout(font, str, x, y, size) {
  const scale = size / font.unitsPerEm;
  const glyphs = [...str].map((ch) => font.charToGlyph(ch));
  const paths = [];
  let pen = x;
  glyphs.forEach((glyph, i) => {
    paths.push(glyph.getPath(pen, y, size));
    pen += (glyph.advanceWidth || 0) * scale;
    if (i < glyphs.length - 1) pen += (font.getKerningValue(glyph, glyphs[i + 1]) || 0) * scale;
  });
  let box = null;
  for (const p of paths) {
    if (p.commands.length === 0) continue;
    const b = p.getBoundingBox();
    box = box
      ? { x1: Math.min(box.x1, b.x1), y1: Math.min(box.y1, b.y1), x2: Math.max(box.x2, b.x2), y2: Math.max(box.y2, b.y2) }
      : { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
  }
  return { paths, width: pen - x, box };
}

// Replays opentype path commands onto the PDF, closing every contour explicitly.
function drawPaths(d, paths) {
  for (const p of paths) {
    let open = false;
    for (const c of p.commands) {
      if (c.type === 'M') {
        if (open) d.closePath();
        d.moveTo(c.x, c.y);
        open = true;
      } else if (c.type === 'L') d.lineTo(c.x, c.y);
      else if (c.type === 'Q') d.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
      else if (c.type === 'C') d.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else if (c.type === 'Z') {
        d.closePath();
        open = false;
      }
    }
    if (open) d.closePath();
  }
  return d;
}

const cutQueue = []; // cut paths are drawn last so they sit on top of the artwork

// Outlined text. `y` is the baseline. Returns the advance width in mm.
function text(str, x, y, capH, opts = {}) {
  const font = fonts[opts.font || 'regular'];
  const size = sizeForCap(font, capH);
  const width = layout(font, str, 0, 0, size).width;
  let x0 = x;
  if (opts.align === 'center') x0 = x - width / 2;
  if (opts.align === 'right') x0 = x - width;
  drawPaths(doc, layout(font, str, x0, y, size).paths).fill(opts.color || BLACK);
  return width;
}

function sectionTitle(letter, title, x, y) {
  text(`${letter}  ${title}`, x, y, 3, { font: 'bold' });
}

function note(lines, x, y) {
  lines.forEach((line, i) => text(line, x, y + i * 4, 2.2));
}

function line(x1, y1, x2, y2, width, color = BLACK) {
  doc.lineWidth(width).moveTo(x1, y1).lineTo(x2, y2).stroke(color);
}

// ---------------------------------------------------------------- header
doc.lineWidth(0.1).rect(5, 5, PAGE_W - 10, PAGE_H - 10).stroke(GREY);
text('CALIBRATION SHEET v1', 15, 20, 5, { font: 'bold' });
text(
  'Print at 100 % — do not scale or fit to media. Page 600 × 320 mm. ' +
    'Cut line = spot colour “CutContour” (magenta hairlines). All text is outlined.',
  15, 27, 2.6
);
text(new Date().toISOString().slice(0, 10), PAGE_W - 15, 20, 2.6, { align: 'right' });

// ---------------------------------------------------------------- A: horizontal ruler
function ruler(x, y, length, vertical) {
  const tick = (pos, len) =>
    vertical ? line(x, y + pos, x + len, y + pos, 0.1) : line(x + pos, y, x + pos, y + len, 0.1);
  if (vertical) line(x, y, x, y + length, 0.1);
  else line(x, y, x + length, y, 0.1);
  for (let i = 0; i <= length; i++) {
    tick(i, i % 10 === 0 ? 6 : i % 5 === 0 ? 4 : 2.5);
    if (i % 50 === 0) {
      if (vertical) text(String(i), x + 7.5, y + i + 1.25, 2.5);
      else text(String(i), x + i, y + 10, 2.5, { align: 'center' });
    }
  }
}
sectionTitle('A', 'HORIZONTAL RULER 500 mm', 50, 42);
text('Measure from tick 0 to tick 500 with a steel rule.', 130, 42, 2.2);
ruler(50, 46, 500, false);

// ---------------------------------------------------------------- B: vertical ruler
sectionTitle('B', 'VERTICAL 200 mm', 12, 68);
ruler(18, 75, 200, true);

// ---------------------------------------------------------------- C: cut registration
sectionTitle('C', 'CUT REGISTRATION', 50, 76);
note(['Cut must land on the black line.', 'Grey lines are 0.5 mm steps.'], 50, 81);
{
  const cx = 101, cy = 141;
  for (const side of [98, 99, 101, 102]) {
    doc.lineWidth(0.1).rect(cx - side / 2, cy - side / 2, side, side).stroke(GREY);
  }
  doc.lineWidth(0.15).rect(cx - 50, cy - 50, 100, 100).stroke(BLACK);
  line(cx - 5, cy, cx + 5, cy, 0.1);
  line(cx, cy - 5, cx, cy + 5, 0.1);
  text('100 × 100 mm', cx, cy + 12, 2.2, { align: 'center' });
  cutQueue.push((d) => d.rect(cx - 50, cy - 50, 100, 100));
}

// ---------------------------------------------------------------- D: bleed
sectionTitle('D', 'BLEED', 175, 76);
note(
  ['Left: 3 mm bleed — colour must reach the cut edge.', 'Right: no bleed — a thin white rim is normal.'],
  175, 81
);
doc.circle(205, 118, 28).fill(RED);
doc.circle(270, 118, 25).fill(RED);
cutQueue.push((d) => d.circle(205, 118, 25));
cutQueue.push((d) => d.circle(270, 118, 25));
text('Ø50, 3 mm bleed', 205, 152, 2, { align: 'center' });
text('Ø50, no bleed', 270, 152, 2, { align: 'center' });

// ---------------------------------------------------------------- E: small cut shapes
sectionTitle('E', 'SMALL CUT SHAPES', 175, 164);
note(['Check that small pieces cut cleanly and stay on the liner.'], 175, 169);

// Print fill with bleed: fill the shape and stroke it at twice the bleed width.
function printWithBleed(draw, color, bleed) {
  draw(doc);
  doc.lineWidth(bleed * 2).lineJoin('round').fillAndStroke(color, color);
  cutQueue.push(draw);
}
{
  const y = 186;
  [[3, 180], [5, 190], [10, 204], [20, 226]].forEach(([dia, x]) => {
    printWithBleed((d) => d.circle(x, y, dia / 2), BLUE, 1);
    text(`Ø${dia}`, x, y + 16, 2, { align: 'center' });
  });

  // Five-point star with sharp tips.
  const sx = 262, sy = 186, outer = 15, inner = 6;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([sx + r * Math.cos(a), sy + r * Math.sin(a)]);
  }
  printWithBleed((d) => d.polygon(...pts), BLUE, 1);
  text('sharp tips', sx, sy + 20, 2, { align: 'center' });

  let sy2 = 212;
  for (const h of [1, 2, 3, 5]) {
    const top = sy2;
    printWithBleed((d) => d.rect(175, top, 40, h), BLUE, 1);
    text(`${h} mm strip`, 219, top + h / 2 + 1, 2);
    sy2 += h + 5;
  }
  printWithBleed((d) => d.roundedRect(245, 214, 40, 20, 3), BLUE, 1);
  text('40 × 20, r 3', 265, 241, 2, { align: 'center' });
}

// ---------------------------------------------------------------- F: cut lettering
sectionTitle('F', 'CUT LETTERING', 315, 76);
note(['Each character is cut on its own outline. Check corners, accents and inner holes.'], 315, 81);
{
  const sample = 'ČĖŽ 08';
  const font = fonts.bold;
  let cursor = 88;
  for (const capH of [35, 20, 12, 8]) {
    const bleed = capH >= 20 ? 1 : 0.5;
    const size = sizeForCap(font, capH);
    const box = layout(font, sample, 0, 0, size).box;
    const baseline = cursor + bleed - box.y1;
    const glyphs = layout(font, sample, 315 + bleed, baseline, size).paths
      .filter((p) => p.commands.length > 0);
    for (const glyph of glyphs) printWithBleed((d) => drawPaths(d, [glyph]), BLACK, bleed);
    text(`${capH} mm`, 315 + box.x2 + 8, baseline, 2.2);
    cursor += box.y2 - box.y1 + 2 * bleed + 6;
  }
}

// ---------------------------------------------------------------- G: print detail
sectionTitle('G', 'PRINT DETAIL', 50, 204);
{
  let y = 211;
  for (const w of [0.1, 0.25, 0.5, 1, 2]) {
    line(50, y, 110, y, w);
    text(`${w} mm line`, 114, y + 1, 2);
    y += 6;
  }
  y += 4;
  for (const capH of [1.5, 2, 3, 5]) {
    y += capH;
    text(`Racing 27 ąčėšž — ${capH} mm`, 50, y, capH);
    y += 3.5;
  }
}

// ---------------------------------------------------------------- H: colour patches
sectionTitle('H', 'COLOUR PATCHES', 315, 236);
note(['Screen colour is not print colour — keep this sheet as your printed reference.'], 315, 241);
[
  ['Black', [0, 0, 0, 100]],
  ['Red', [0, 100, 100, 0]],
  ['Orange', [0, 60, 100, 0]],
  ['Yellow', [0, 0, 100, 0]],
  ['Green', [100, 0, 100, 0]],
  ['Blue', [100, 70, 0, 0]],
  ['Grey', [0, 0, 0, 50]],
  ['White', null],
].forEach(([name, cmyk], i) => {
  const x = 315 + i * 31, y = 246;
  if (cmyk) doc.rect(x, y, 25, 25).fill(cmyk);
  else doc.lineWidth(0.1).rect(x, y, 25, 25).stroke(GREY);
  text(name, x, y + 29.5, 2);
  text(cmyk ? `C${cmyk[0]} M${cmyk[1]} Y${cmyk[2]} K${cmyk[3]}` : 'unprinted', x, y + 33, 1.4);
});

// ---------------------------------------------------------------- footer
text(
  'Measured:   A = ____________ mm     B = ____________ mm     ' +
    'Supplier / printer: ______________________________     Date: ______________',
  15, 301, 2.6
);
text('AI Motorsport Graphics Studio — calibration sheet v1', 15, 309, 2);

// ---------------------------------------------------------------- cut contours (on top)
for (const draw of cutQueue) {
  draw(doc);
  doc.lineWidth(CUT_WIDTH).lineJoin('miter').stroke(CUT_NAME);
}

doc.end();
console.log(`Wrote ${OUT} (${cutQueue.length} cut paths)`);
