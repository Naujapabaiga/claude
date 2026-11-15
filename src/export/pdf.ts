// Minimal vector PDF writer for production files.
//
// Output: one page at real size, print artwork in CMYK on a "Print" layer and
// cut contours as hairlines in a named spot colour on a second layer. There are
// no fonts and no images in the file: everything is outlines.

import type { Path, Ring } from '../geometry/path';
import { swatch } from '../model/swatches';
import type { Doc } from '../model/types';
import type { Placed } from './placed';

const PT_PER_MM = 72 / 25.4;
/** Cut hairline: 0.25 pt, the width cutter software conventionally expects. */
const CUT_WIDTH_PT = 0.25;

function num(v: number): string {
  const s = v.toFixed(3);
  const t = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  return t === '-0' || t === '' ? '0' : t;
}

function ringsOps(rings: Ring[]): string {
  let out = '';
  for (const r of rings) {
    r.forEach((p, i) => {
      out += `${num(p.x)} ${num(p.y)} ${i === 0 ? 'm' : 'l'}\n`;
    });
    out += 'h\n';
  }
  return out;
}

function pathOps(path: Path): string {
  let out = '';
  let cx = 0;
  let cy = 0;
  let open = false;
  for (const c of path) {
    if (c.t === 'M') {
      if (open) out += 'h\n';
      out += `${num(c.x)} ${num(c.y)} m\n`;
      open = true;
    } else if (c.t === 'L') {
      out += `${num(c.x)} ${num(c.y)} l\n`;
    } else if (c.t === 'Q') {
      // PDF has no quadratic curves; raise to an exact cubic.
      const x1 = cx + (2 / 3) * (c.x1 - cx);
      const y1 = cy + (2 / 3) * (c.y1 - cy);
      const x2 = c.x + (2 / 3) * (c.x1 - c.x);
      const y2 = c.y + (2 / 3) * (c.y1 - c.y);
      out += `${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(c.x)} ${num(c.y)} c\n`;
    } else if (c.t === 'C') {
      out += `${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)} c\n`;
    } else {
      out += 'h\n';
      open = false;
    }
    if (c.t !== 'Z') {
      cx = c.x;
      cy = c.y;
    }
  }
  if (open) out += 'h\n';
  return out;
}

/** Escapes a PDF name (e.g. the spot colour name). */
function pdfName(name: string): string {
  let out = '';
  for (const byte of new TextEncoder().encode(name)) {
    const ch = String.fromCharCode(byte);
    out += /[A-Za-z0-9_.-]/.test(ch) ? ch : '#' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return out || 'CutContour';
}

/** Text string as UTF-16BE hex, so any language survives. */
function pdfText(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
}

function pdfDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `(D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(
    d.getUTCMinutes()
  )}${p(d.getUTCSeconds())}Z)`;
}

export function buildPdf(doc: Doc, placed: Placed): Uint8Array {
  const wPt = doc.artboard.width * PT_PER_MM;
  const hPt = doc.artboard.height * PT_PER_MM;

  // Page content. The matrix switches to millimetres with the origin top-left.
  let content = 'q\n';
  content += `${num(PT_PER_MM)} 0 0 ${num(-PT_PER_MM)} 0 ${num(hPt)} cm\n`;
  content += '/OC /LPrint BDC\n';
  for (const shape of placed.print) {
    const [c, m, y, k] = swatch(shape.color).cmyk;
    content += `${num(c / 100)} ${num(m / 100)} ${num(y / 100)} ${num(k / 100)} k\n`;
    content += shape.kind === 'rings' ? ringsOps(shape.rings) : pathOps(shape.path);
    content += 'f\n';
  }
  content += 'EMC\n';
  content += '/OC /LCut BDC\n';
  content += `/CSCut CS 1 SCN\n${num(CUT_WIDTH_PT / PT_PER_MM)} w 0 j\n`;
  for (const ring of placed.cut) content += ringsOps([ring]) + 'S\n';
  content += 'EMC\nQ\n';

  const box = `[0 0 ${num(wPt)} ${num(hPt)}]`;
  const objects: string[] = [
    // 1: catalog, with the two layers switched on
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R 7 0 R] ' +
      '/D << /Order [7 0 R 6 0 R] /ON [6 0 R 7 0 R] /BaseState /ON >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /TrimBox ${box} /Contents 4 0 R ` +
      '/Resources << /ColorSpace << /CSCut 5 0 R >> /Properties << /LPrint 6 0 R /LCut 7 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    // 5: the spot colour; shown on screen as process magenta
    `[/Separation /${pdfName(doc.cutName)} /DeviceCMYK ` +
      '<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]',
    '<< /Type /OCG /Name (Print) >>',
    `<< /Type /OCG /Name ${pdfText(doc.cutName)} >>`,
    `<< /Title ${pdfText(doc.name)} /Producer (Motorsport Graphics Studio) /CreationDate ${pdfDate(new Date())} >>`,
  ];

  let file = '%PDF-1.6\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) file += `${String(off).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Every character above is in the single-byte range, so offsets equal byte positions.
  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 0xff;
  return bytes;
}
