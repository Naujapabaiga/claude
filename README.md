# Motorsport Graphics Studio

A browser tool for designing racing numbers, driver names and stripes at real
size, and exporting print-and-cut files for a vinyl print shop.

## What it does today

- Draws at 1:1 in millimetres on a sheet you size yourself.
- Racing numbers and names in eight open-licence fonts, all with Lithuanian letters.
- Outlines, lean, rotation and spacing, with the finished size shown as you edit.
- Stripes with any number of bands, gaps and angled ends.
- Cuts each character separately or the whole name as one sticker.
- Shapes: rectangles, circles and logos imported from SVG files, with unite,
  subtract and intersect, and point-by-point editing of outlines and curves.
- Exports a vector PDF: CMYK artwork with bleed, plus the cut line as a spot
  colour (`CutContour` by default) on its own layer. No fonts are embedded;
  all text is outlines.
- Exports an SVG sized in millimetres for other design software.
- Warns before export when artwork leaves the sheet, is too small to cut well,
  or when two pieces overlap so their cut lines would cross.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints (normally http://localhost:5173).

## Check it

```bash
npm test
```

The tests cover the geometry, cut contours and both exporters, and write a
sample PDF and SVG to `tests/out/`.

## Calibration sheet

`tools/calibration-sheet/calibration-sheet-v1.pdf` is a 600 × 320 mm test print
for a new supplier: rulers, cut registration, bleed, small shapes and cut
lettering. Print it at 100 % and measure the rulers.

## Not built yet

A free-drawing pen tool, converting text to editable shapes, vehicle photo
preview, and AI generation and editing.
