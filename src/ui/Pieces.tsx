import type { Dispatch } from 'react';
import { objectLabel } from '../checks';
import { newName, newNumber, newStripe } from '../model/defaults';
import { swatch } from '../model/swatches';
import type { DesignObject, Doc } from '../model/types';
import type { Built } from '../render/build';
import type { Action } from '../state';

interface Props {
  doc: Doc;
  built: Map<string, Built>;
  selectedId: string | null;
  dispatch: Dispatch<Action>;
}

const mm = (v: number) => Math.round(v).toLocaleString('en-GB');

export function Pieces({ doc, built, selectedId, dispatch }: Props) {
  const add = (make: (x: number, y: number) => DesignObject) => {
    const x = Math.round(doc.artboard.width * 0.1);
    const y = Math.round(doc.artboard.height * 0.5);
    dispatch({ type: 'add', object: make(x, y), at: Date.now() });
  };
  // Front-most piece first, the way layer lists usually read.
  const ordered = [...doc.objects].reverse();
  return (
    <aside className="panel pieces" aria-label="Pieces">
      <section>
        <h2>Add</h2>
        <div className="add">
          <button type="button" onClick={() => add(newNumber)}>
            <span className="glyph" aria-hidden="true">27</span>
            Number
          </button>
          <button type="button" onClick={() => add(newName)}>
            <span className="glyph" aria-hidden="true">Aa</span>
            Name
          </button>
          <button type="button" onClick={() => add(newStripe)}>
            <span className="glyph stripes" aria-hidden="true" />
            Stripe
          </button>
        </div>
      </section>
      <section>
        <h2>Pieces</h2>
        {ordered.length === 0 ? (
          <p className="hint">Nothing here yet. Add a number, a name or a stripe to start.</p>
        ) : (
          <ul className="piece-list">
            {ordered.map((o) => {
              const box = built.get(o.id)?.box;
              const color = swatch(o.type === 'stripe' ? o.color : o.fill).rgb;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    aria-pressed={o.id === selectedId}
                    onClick={() => dispatch({ type: 'select', id: o.id })}
                  >
                    <span className="dot" style={{ background: color }} aria-hidden="true" />
                    <span className="piece-name">{objectLabel(o)}</span>
                    <span className="piece-size">{box ? `${mm(box.x2 - box.x1)} × ${mm(box.y2 - box.y1)}` : 'empty'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
