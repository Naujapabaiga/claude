import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { handlesOf, listAnchors, moveAnchor, moveHandle } from '../geometry/nodes';
import { applyToPoint, invert, pathToSvg, ringsToSvg } from '../geometry/path';
import { swatch } from '../model/swatches';
import type { Doc } from '../model/types';
import { shapeMatrix, type Built } from '../render/build';
import type { Action } from '../state';

export type ViewMode = 'production' | 'finished';

interface Props {
  doc: Doc;
  built: Map<string, Built>;
  selectedId: string | null;
  extraIds: string[];
  mode: ViewMode;
  /** Shape whose points are being edited, if any. */
  editingId: string | null;
  activeNode: NodeRef | null;
  onActiveNode: (node: NodeRef | null) => void;
  dispatch: Dispatch<Action>;
}

/** A point on a shape: which part, and which path command holds it. */
export interface NodeRef {
  part: number;
  index: number;
}

interface View {
  /** Screen pixels per millimetre. */
  scale: number;
  tx: number;
  ty: number;
}

const RULER = 24;
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const round1 = (v: number) => Math.round(v * 10) / 10;

interface Drawn {
  print: { d: string; fill: string }[];
  cut: string;
}
const drawnCache = new WeakMap<Built, Drawn>();

function drawn(b: Built): Drawn {
  let out = drawnCache.get(b);
  if (!out) {
    out = {
      print: b.print.map((s) => ({
        d: s.kind === 'rings' ? ringsToSvg(s.rings) : pathToSvg(s.path),
        fill: swatch(s.color).rgb,
      })),
      cut: ringsToSvg(b.cut),
    };
    drawnCache.set(b, out);
  }
  return out;
}

type Drag =
  | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number; moved: boolean }
  | { kind: 'move'; id: string; startX: number; startY: number; x: number; y: number }
  | { kind: 'node'; part: number; index: number; which: 0 | 1 | 2 };

export function Canvas({ doc, built, selectedId, extraIds, mode, editingId, activeNode, onActiveNode, dispatch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [measured, setMeasured] = useState(false);
  const [view, setView] = useState<View>({ scale: 0.5, tx: 40, ty: 40 });
  const drag = useRef<Drag | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const editingObject = doc.objects.find((o) => o.id === editingId);
  const editing = editingObject?.type === 'shape' ? editingObject : null;

  const fit = useCallback(
    (w: number, h: number) => {
      const pad = 48;
      const scale = Math.min((w - RULER - pad * 2) / doc.artboard.width, (h - RULER - pad * 2) / doc.artboard.height);
      const s = Math.max(0.02, scale);
      setView({
        scale: s,
        tx: RULER + (w - RULER - doc.artboard.width * s) / 2,
        ty: RULER + (h - RULER - doc.artboard.height * s) / 2,
      });
    },
    [doc.artboard.width, doc.artboard.height]
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setMeasured(true);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  // Fit the sheet when the canvas first gets a size and whenever the sheet size changes.
  const fitted = useRef('');
  useEffect(() => {
    const key = `${doc.artboard.width}x${doc.artboard.height}`;
    if (!measured || size.w < 50 || fitted.current === key) return;
    fitted.current = key;
    fit(size.w, size.h);
  }, [measured, size.w, size.h, doc.artboard.width, doc.artboard.height, fit]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const scale = Math.min(60, Math.max(0.02, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }, []);

  // Wheel zoom needs a non-passive listener so the page itself does not scroll.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toMm = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = (e.target as Element).closest('[data-object-id]');
    const node = (e.target as Element).closest('[data-node]');
    e.currentTarget.setPointerCapture(e.pointerId);
    if (node) {
      const [part, index, which] = node.getAttribute('data-node')!.split(':').map(Number);
      drag.current = { kind: 'node', part, index, which: which as 0 | 1 | 2 };
      if (which === 0) onActiveNode({ part, index });
    } else if (target && e.shiftKey) {
      dispatch({ type: 'select', id: target.getAttribute('data-object-id'), add: true });
    } else if (target) {
      const id = target.getAttribute('data-object-id')!;
      const obj = doc.objects.find((o) => o.id === id);
      if (!obj) return;
      dispatch({ type: 'select', id });
      const p = toMm(e.clientX, e.clientY);
      drag.current = { kind: 'move', id, startX: p.x, startY: p.y, x: obj.x, y: obj.y };
    } else {
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toMm(e.clientX, e.clientY);
    if (readoutRef.current) readoutRef.current.textContent = `${Math.round(p.x)}, ${Math.round(p.y)} mm`;
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
    } else if (d.kind === 'node') {
      if (!editing) return;
      const local = applyToPoint(invert(shapeMatrix(editing)), p.x - editing.x, p.y - editing.y);
      const parts = editing.parts.map((part, i) => {
        if (i !== d.part) return part;
        const path =
          d.which === 0
            ? moveAnchor(part.path, d.index, local.x, local.y)
            : moveHandle(part.path, { index: d.index, which: d.which }, local.x, local.y);
        return { ...part, path };
      });
      dispatch({ type: 'update', id: editing.id, patch: { parts }, key: `${editing.id}:node`, at: Date.now() });
    } else {
      dispatch({
        type: 'update',
        id: d.id,
        patch: { x: round1(d.x + p.x - d.startX), y: round1(d.y + p.y - d.startY) },
        key: `${d.id}:drag`,
        at: Date.now(),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d?.kind === 'pan' && !d.moved) dispatch({ type: 'select', id: null });
  };

  const selected = doc.objects.find((o) => o.id === selectedId);
  const extras = doc.objects.filter((o) => extraIds.includes(o.id));
  const selectedBox = selected ? built.get(selected.id)?.box : null;
  const { scale, tx, ty } = view;

  const gridStep = STEPS.find((s) => s * scale >= 9) ?? 5000;
  const majorStep = STEPS.find((s) => s * scale >= 64) ?? 5000;

  const rulers = useMemo(() => {
    const top: { pos: number; label: string | null }[] = [];
    const left: { pos: number; label: string | null }[] = [];
    const fromX = Math.floor(-tx / scale / gridStep) * gridStep;
    const toX = (size.w - tx) / scale;
    for (let v = fromX; v <= toX; v += gridStep) {
      top.push({ pos: tx + v * scale, label: v % majorStep === 0 ? String(v) : null });
    }
    const fromY = Math.floor(-ty / scale / gridStep) * gridStep;
    const toY = (size.h - ty) / scale;
    for (let v = fromY; v <= toY; v += gridStep) {
      left.push({ pos: ty + v * scale, label: v % majorStep === 0 ? String(v) : null });
    }
    return { top, left };
  }, [tx, ty, scale, size.w, size.h, gridStep, majorStep]);

  return (
    <div className="canvas" ref={wrapRef}>
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Design sheet, ${doc.artboard.width} by ${doc.artboard.height} millimetres`}
      >
        <defs>
          <pattern id="grid-minor" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <path d={`M${gridStep} 0H0V${gridStep}`} className="grid-minor" vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="grid-major" width={majorStep} height={majorStep} patternUnits="userSpaceOnUse">
            <path d={`M${majorStep} 0H0V${majorStep}`} className="grid-major" vectorEffect="non-scaling-stroke" />
          </pattern>
          {mode === 'finished' &&
            doc.objects.map((o) => {
              const b = built.get(o.id);
              return b ? (
                <clipPath key={o.id} id={`clip-${o.id}`}>
                  <path d={drawn(b).cut} clipRule="nonzero" />
                </clipPath>
              ) : null;
            })}
        </defs>

        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          <rect className="sheet" width={doc.artboard.width} height={doc.artboard.height} />
          <rect width={doc.artboard.width} height={doc.artboard.height} fill="url(#grid-minor)" pointerEvents="none" />
          <rect width={doc.artboard.width} height={doc.artboard.height} fill="url(#grid-major)" pointerEvents="none" />

          {doc.objects.map((o) => {
            const b = built.get(o.id);
            if (!b || !b.box) return null;
            const art = drawn(b);
            const pad = 4 / scale;
            return (
              <g key={o.id} transform={`translate(${o.x} ${o.y})`} data-object-id={o.id} className="object">
                <g clipPath={mode === 'finished' ? `url(#clip-${o.id})` : undefined}>
                  {art.print.map((p, i) => (
                    <path key={i} d={p.d} fill={p.fill} />
                  ))}
                </g>
                <path
                  d={art.cut}
                  className={mode === 'production' ? 'cut' : 'sticker-edge'}
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={b.box.x1 - pad}
                  y={b.box.y1 - pad}
                  width={b.box.x2 - b.box.x1 + pad * 2}
                  height={b.box.y2 - b.box.y1 + pad * 2}
                  fill="transparent"
                />
              </g>
            );
          })}
        </g>

        {selected && selectedBox && (
          <g pointerEvents="none">
            <rect
              className="selection"
              x={tx + (selected.x + selectedBox.x1) * scale - 3}
              y={ty + (selected.y + selectedBox.y1) * scale - 3}
              width={(selectedBox.x2 - selectedBox.x1) * scale + 6}
              height={(selectedBox.y2 - selectedBox.y1) * scale + 6}
            />
            <text
              className="selection-size"
              x={tx + (selected.x + selectedBox.x1) * scale - 3}
              y={ty + (selected.y + selectedBox.y1) * scale - 9}
            >
              {round1(selectedBox.x2 - selectedBox.x1)} × {round1(selectedBox.y2 - selectedBox.y1)} mm
            </text>
          </g>
        )}

        {extras.map((o) => {
          const box = built.get(o.id)?.box;
          return box ? (
            <rect
              key={o.id}
              className="selection"
              pointerEvents="none"
              x={tx + (o.x + box.x1) * scale - 3}
              y={ty + (o.y + box.y1) * scale - 3}
              width={(box.x2 - box.x1) * scale + 6}
              height={(box.y2 - box.y1) * scale + 6}
            />
          ) : null;
        })}

        {editing && (
          <g className="nodes">
            {editing.parts.map((part, pi) => {
              const matrix = shapeMatrix(editing);
              const screen = (x: number, y: number) => {
                const p = applyToPoint(matrix, x, y);
                return { x: tx + (editing.x + p.x) * scale, y: ty + (editing.y + p.y) * scale };
              };
              const active = activeNode && activeNode.part === pi ? activeNode.index : -1;
              const anchors = listAnchors(part.path);
              return (
                <g key={pi}>
                  {active >= 0 &&
                    handlesOf(part.path, active).map((h) => {
                      const a = part.path[active];
                      if (a.t === 'Z') return null;
                      const from = screen(a.x, a.y);
                      const to = screen(h.x, h.y);
                      return (
                        <g key={`${h.index}:${h.which}`}>
                          <line className="handle-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                          <circle className="handle" cx={to.x} cy={to.y} r={5} data-node={`${pi}:${h.index}:${h.which}`} />
                        </g>
                      );
                    })}
                  {anchors.map((a) => {
                    const p = screen(a.x, a.y);
                    return (
                      <rect
                        key={a.index}
                        className={a.index === active ? 'anchor active' : 'anchor'}
                        x={p.x - 4.5}
                        y={p.y - 4.5}
                        width={9}
                        height={9}
                        data-node={`${pi}:${a.index}:0`}
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        )}

        <g className="rulers" pointerEvents="none">
          <rect width={size.w} height={RULER} />
          <rect width={RULER} height={size.h} />
          {rulers.top.map((t) => (
            <g key={`t${t.pos}`}>
              <line x1={t.pos} x2={t.pos} y1={t.label ? 8 : 17} y2={RULER} />
              {t.label && (
                <text x={t.pos + 3} y={11}>
                  {t.label}
                </text>
              )}
            </g>
          ))}
          {rulers.left.map((t) => (
            <g key={`l${t.pos}`}>
              <line y1={t.pos} y2={t.pos} x1={t.label ? 8 : 17} x2={RULER} />
              {t.label && (
                <text transform={`translate(11 ${t.pos + 3}) rotate(-90)`} textAnchor="end">
                  {t.label}
                </text>
              )}
            </g>
          ))}
          <rect className="corner" width={RULER} height={RULER} />
          <text className="corner-unit" x={RULER / 2} y={15} textAnchor="middle">
            mm
          </text>
        </g>
      </svg>

      <div className="canvas-bar">
        <span ref={readoutRef} className="readout" aria-hidden="true" />
        <span className="zoom-label">1 mm = {scale >= 1 ? round1(scale) : Math.round(scale * 100) / 100} px</span>
        <button type="button" onClick={() => zoomAt(1 / 1.3, size.w / 2, size.h / 2)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => zoomAt(1.3, size.w / 2, size.h / 2)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => fit(size.w, size.h)}>
          Fit sheet
        </button>
      </div>
    </div>
  );
}
