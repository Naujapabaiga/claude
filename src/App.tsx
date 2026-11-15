import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { runChecks } from './checks';
import { download, fileStem } from './download';
import { buildPdf } from './export/pdf';
import { place } from './export/placed';
import { buildSvg } from './export/svg';
import { loadFonts } from './fonts/browser';
import type { FontSet } from './geometry/text';
import { buildKey, buildObject, type Built } from './render/build';
import { initialState, parseDoc, reducer, saveLocally } from './state';
import { Canvas, type ViewMode } from './ui/Canvas';
import { Inspector } from './ui/Inspector';
import { Pieces } from './ui/Pieces';

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('production');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { doc, selectedId } = state;

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
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          dispatch({ type: 'remove', id: selected.id, at });
        } else if (mod && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          dispatch({ type: 'duplicate', id: selected.id, at });
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
  }, [selected]);

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

      <Pieces doc={doc} built={built} selectedId={selectedId} dispatch={dispatch} />

      <main className="stage">
        {fontError ? (
          <p className="stage-message">The fonts did not load ({fontError}). Reload the page to try again.</p>
        ) : !fonts ? (
          <p className="stage-message">Loading fonts…</p>
        ) : (
          <Canvas doc={doc} built={built} selectedId={selectedId} mode={mode} dispatch={dispatch} />
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </main>

      <Inspector doc={doc} selected={selected} built={built} warnings={warnings} dispatch={dispatch} />
    </div>
  );
}
