import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { runChecks } from './checks';
import { download, fileStem } from './download';
import { buildPdf } from './export/pdf';
import { place } from './export/placed';
import { buildSvg } from './export/svg';
import { loadFonts } from './fonts/browser';
import { addPointAfter, deleteAnchor } from './geometry/nodes';
import type { BooleanOp } from './geometry/paperOps';
import { newShape } from './model/defaults';
import type { ShapeObject } from './model/types';
import { combineShapes } from './shapes';
import { importSvg } from './svgImport';
import type { FontSet } from './geometry/text';
import { buildKey, buildObject, type Built } from './render/build';
import { initialState, parseDoc, reducer, saveLocally } from './state';
import { Canvas, type NodeRef, type ViewMode } from './ui/Canvas';
import { Inspector } from './ui/Inspector';
import { Pieces } from './ui/Pieces';

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('production');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const svgInput = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<NodeRef | null>(null);
  const { doc, selectedId, extraIds } = state;

  useEffect(() => {
    loadFonts().then(setFonts, (e: Error) => setFontError(e.message));
  }, []);

  useEffect(() => saveLocally(doc), [doc]);

  // Geometry is rebuilt only for objects whose shape actually changed.
  const cache = useRef(new Map<string, { key: string; built: Built }>());
  const built = useMemo(() => {
    const out = new Map<string, Built>();
    if (!fonts) return out;
    const next = new Map<string, { key: string; built: Built }>();
    for (const obj of doc.objects) {
      const key = buildKey(obj, doc.bleed);
      const hit = cache.current.get(obj.id);
      const entry = hit && hit.key === key ? hit : { key, built: buildObject(obj, { fonts, bleed: doc.bleed }) };
      next.set(obj.id, entry);
      out.set(obj.id, entry.built);
    }
    cache.current = next;
    return out;
  }, [doc.objects, doc.bleed, fonts]);

  const warnings = useMemo(() => (fonts ? runChecks(doc, built) : []), [doc, built, fonts]);
  const selected = doc.objects.find((o) => o.id === selectedId) ?? null;
  const extraShapes = doc.objects.filter((o): o is ShapeObject => o.type === 'shape' && extraIds.includes(o.id));
  const editing = selected?.type === 'shape' && selected.id === editingId ? selected : null;

  // Point editing ends when the shape is deselected or removed.
  useEffect(() => {
    if (editingId && selectedId !== editingId) {
      setEditingId(null);
      setActiveNode(null);
    }
  }, [editingId, selectedId]);

  const pointAction = (action: 'add' | 'delete') => {
    if (!editing || !activeNode) return;
    const part = editing.parts[activeNode.part];
    if (!part) return;
    let path = part.path;
    let next: NodeRef | null = null;
    if (action === 'add') {
      const added = addPointAfter(path, activeNode.index);
      if (!added) return;
      path = added.path;
      next = { part: activeNode.part, index: added.index };
    } else {
      path = deleteAnchor(path, activeNode.index);
      if (path === part.path) {
        setNotice('A shape needs at least three points.');
        return;
      }
    }
    const parts = editing.parts.map((p, i) => (i === activeNode.part ? { ...p, path } : p));
    dispatch({ type: 'update', id: editing.id, patch: { parts }, at: Date.now() });
    setActiveNode(next);
  };

  const combine = (op: BooleanOp) => {
    if (selected?.type !== 'shape' || extraShapes.length === 0) return;
    const ids = [selected.id, ...extraShapes.map((s) => s.id)];
    const ordered = doc.objects.filter((o): o is ShapeObject => o.type === 'shape' && ids.includes(o.id));
    try {
      const result = combineShapes(ordered, op);
      if (!result) {
        setNotice('Nothing is left after that. The shapes may not overlap.');
        return;
      }
      dispatch({ type: 'combine', removeIds: ids, object: result, at: Date.now() });
    } catch {
      setNotice('These shapes could not be combined. Try simplifying them first.');
    }
  };

  const importLogo = async (file: File) => {
    try {
      const result = importSvg(await file.text());
      const shape = newShape(file.name.replace(/\.svg$/i, ''), result.parts, 0, 0);
      // Logos larger than the sheet are scaled down to fit; smaller ones keep their real size.
      const fitScale = Math.min(1, (doc.artboard.width * 0.6) / result.width, (doc.artboard.height * 0.6) / result.height);
      const placed = {
        ...shape,
        lockRatio: true,
        sx: fitScale,
        sy: fitScale,
        x: Math.round((doc.artboard.width - result.width * fitScale) / 2),
        y: Math.round((doc.artboard.height - result.height * fitScale) / 2),
      };
      dispatch({ type: 'add', object: placed, at: Date.now() });
      const size = `${Math.round(result.width * fitScale)} × ${Math.round(result.height * fitScale)} mm`;
      setNotice(result.notes.length > 0 ? `Imported at ${size}. Note: ${result.notes.join('; ')}.` : `Imported ${file.name} at ${size}.`);
    } catch (e) {
      setNotice(`${file.name} could not be imported. ${e instanceof Error ? e.message : ''}`);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        if (typing) return;
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (!typing && selected) {
        const at = Date.now();
        if ((e.key === 'Delete' || e.key === 'Backspace') && editing) {
          e.preventDefault();
          if (activeNode) pointAction('delete');
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          dispatch({ type: 'remove', id: selected.id, at });
        } else if (mod && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          dispatch({ type: 'duplicate', id: selected.id, at });
        } else if (e.key === 'Escape' && editing) {
          setEditingId(null);
          setActiveNode(null);
        } else if (e.key === 'Escape') {
          dispatch({ type: 'select', id: null });
        } else if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          dispatch({
            type: 'update',
            id: selected.id,
            patch: { x: selected.x + dx, y: selected.y + dy },
            key: `${selected.id}:nudge`,
            at,
          });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportPdf = () => {
    download(buildPdf(doc, place(doc.objects, built)) as BlobPart, 'application/pdf', `${fileStem(doc.name)}.pdf`);
    setNotice(`Exported ${fileStem(doc.name)}.pdf at ${doc.artboard.width} × ${doc.artboard.height} mm.`);
  };
  const exportSvg = () => {
    download(buildSvg(doc, place(doc.objects, built)), 'image/svg+xml', `${fileStem(doc.name)}.svg`);
    setNotice(`Exported ${fileStem(doc.name)}.svg.`);
  };
  const saveProject = () => {
    download(JSON.stringify(doc, null, 2), 'application/json', `${fileStem(doc.name)}.livery.json`);
    setNotice('Project saved to a file.');
  };
  const openProject = async (file: File) => {
    try {
      const parsed = parseDoc(JSON.parse(await file.text()));
      if (!parsed) throw new Error('not a project file');
      dispatch({ type: 'load', doc: parsed, at: Date.now() });
      setNotice(`Opened ${file.name}.`);
    } catch {
      setNotice(`${file.name} is not a project file from this app. Choose a .livery.json file.`);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Motorsport Graphics Studio</span>
        <input
          className="doc-name"
          aria-label="Project name"
          value={doc.name}
          onChange={(e) => dispatch({ type: 'doc', patch: { name: e.target.value }, key: 'name', at: Date.now() })}
        />
        <div className="group">
          <button type="button" disabled={state.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>
            Undo
          </button>
          <button type="button" disabled={state.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>
            Redo
          </button>
        </div>
        <div className="group view" role="group" aria-label="Preview">
          <button type="button" aria-pressed={mode === 'production'} onClick={() => setMode('production')}>
            <span className="cut-dot" aria-hidden="true" />
            Print file
          </button>
          <button type="button" aria-pressed={mode === 'finished'} onClick={() => setMode('finished')}>
            Finished stickers
          </button>
        </div>
        <div className="group right">
          <button type="button" onClick={() => fileInput.current?.click()}>
            Open
          </button>
          <button type="button" onClick={saveProject}>
            Save project
          </button>
          <button type="button" onClick={exportSvg} disabled={!fonts}>
            Export SVG
          </button>
          <button type="button" className="primary" onClick={exportPdf} disabled={!fonts}>
            Export PDF
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void openProject(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <Pieces
        doc={doc}
        built={built}
        selectedId={selectedId}
        extraIds={extraIds}
        onImport={() => svgInput.current?.click()}
        dispatch={dispatch}
      />
      <input
        ref={svgInput}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importLogo(file);
          e.target.value = '';
        }}
      />

      <main className="stage">
        {fontError ? (
          <p className="stage-message">The fonts did not load ({fontError}). Reload the page to try again.</p>
        ) : !fonts ? (
          <p className="stage-message">Loading fonts…</p>
        ) : (
          <Canvas
            doc={doc}
            built={built}
            selectedId={selectedId}
            extraIds={extraIds}
            mode={mode}
            editingId={editing?.id ?? null}
            activeNode={activeNode}
            onActiveNode={setActiveNode}
            dispatch={dispatch}
          />
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </main>

      <Inspector
        doc={doc}
        selected={selected}
        built={built}
        warnings={warnings}
        extraShapes={extraShapes}
        editing={editing !== null}
        hasActivePoint={activeNode !== null}
        onCombine={combine}
        onEditPoints={(on) => {
          setEditingId(on && selected ? selected.id : null);
          setActiveNode(null);
        }}
        onPointAction={pointAction}
        dispatch={dispatch}
      />
    </div>
  );
}
