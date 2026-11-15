// SVG export for exchanging artwork with other design software. Sizes are
// written in millimetres so the file opens at real scale. SVG cannot carry
// spot colours, so the cut contours are a magenta hairline on their own layer.

import { pathToSvg, ringsToSvg } from '../geometry/path';
import { swatch } from '../model/swatches';
import type { Doc } from '../model/types';
import type { Placed } from './placed';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildSvg(doc: Doc, placed: Placed): string {
  const { width, height } = doc.artboard;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`
  );
  lines.push(`<title>${esc(doc.name)}</title>`);
  lines.push('<g id="Print" inkscape:groupmode="layer" inkscape:label="Print">');
  for (const shape of placed.print) {
    const d = shape.kind === 'rings' ? ringsToSvg(shape.rings) : pathToSvg(shape.path);
    lines.push(`<path fill="${swatch(shape.color).rgb}" d="${d}"/>`);
  }
  lines.push('</g>');
  const cutLabel = esc(doc.cutName);
  lines.push(
    `<g id="${cutLabel}" inkscape:groupmode="layer" inkscape:label="${cutLabel}" ` +
      `fill="none" stroke="#ec008c" stroke-width="0.088">`
  );
  for (const ring of placed.cut) lines.push(`<path d="${ringsToSvg([ring])}"/>`);
  lines.push('</g>');
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
