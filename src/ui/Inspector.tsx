import type { Dispatch } from 'react';
import type { Warning } from '../checks';
import { FONTS } from '../fonts/registry';
import type { BooleanOp } from '../geometry/paperOps';
import { flatten, ringsBox } from '../geometry/path';
import type { DesignObject, Doc, LetteringObject, ShapeObject, StripeObject } from '../model/types';
import type { Built } from '../render/build';
import type { Action } from '../state';
import { Choice, Field, NumberField, SwatchField, TextField } from './fields';

interface Props {
  doc: Doc;
  selected: DesignObject | null;
  built: Map<string, Built>;
  warnings: Warning[];
  /** Other shapes selected together with `selected`. */
  extraShapes: ShapeObject[];
  editing: boolean;
  hasActivePoint: boolean;
  onCombine: (op: BooleanOp) => void;
  onEditPoints: (on: boolean) => void;
  onPointAction: (action: 'add' | 'delete') => void;
  dispatch: Dispatch<Action>;
}

interface ShapeTools {
  extraShapes: ShapeObject[];
  editing: boolean;
  hasActivePoint: boolean;
  onCombine: (op: BooleanOp) => void;
  onEditPoints: (on: boolean) => void;
  onPointAction: (action: 'add' | 'delete') => void;
}

const mm = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-GB');

export function Inspector({ doc, selected, built, warnings, dispatch, ...tools }: Props) {
  return (
    <aside className="panel inspector" aria-label="Properties">
      {selected ? (
        <ObjectProps key={selected.id} object={selected} built={built.get(selected.id)} doc={doc} dispatch={dispatch} tools={tools} />
      ) : (
        <SheetProps doc={doc} dispatch={dispatch} />
      )}
      <Checks warnings={warnings} dispatch={dispatch} />
    </aside>
  );
}

function SheetProps({ doc, dispatch }: { doc: Doc; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<Doc>, key: string) => dispatch({ type: 'doc', patch, key, at: Date.now() });
  return (
    <section>
      <h2>Sheet</h2>
      <p className="hint">Select a piece to edit it. These settings apply to the whole file.</p>
      <div className="row">
        <NumberField
          label="Width"
          value={doc.artboard.width}
          min={50}
          max={20000}
          step={10}
          onChange={(width) => set({ artboard: { ...doc.artboard, width } }, 'sheet-w')}
        />
        <NumberField
          label="Height"
          value={doc.artboard.height}
          min={50}
          max={20000}
          step={10}
          onChange={(height) => set({ artboard: { ...doc.artboard, height } }, 'sheet-h')}
        />
      </div>
      <h3>Production</h3>
      <NumberField label="Bleed past the cut" value={doc.bleed} min={0} max={20} step={0.5} onChange={(bleed) => set({ bleed }, 'bleed')} />
      <TextField label="Cut line colour name" value={doc.cutName} onChange={(cutName) => set({ cutName }, 'cut-name')} />
      <p className="hint">
        The print shop's software finds the cut line by this name. “CutContour” is the usual one; change it only if a
        supplier asks.
      </p>
    </section>
  );
}

function ObjectProps({
  object,
  built,
  doc,
  dispatch,
  tools,
}: {
  object: DesignObject;
  built: Built | undefined;
  doc: Doc;
  dispatch: Dispatch<Action>;
  tools: ShapeTools;
}) {
  const at = () => Date.now();
  const index = doc.objects.findIndex((o) => o.id === object.id);
  const box = built?.box;
  return (
    <section>
      <h2>{object.type === 'stripe' ? 'Stripe' : object.type === 'shape' ? 'Shape' : object.role === 'number' ? 'Number' : 'Name'}</h2>
      <p className="size" aria-label="Finished size">
        {box ? `${mm(box.x2 - box.x1)} × ${mm(box.y2 - box.y1)} mm finished` : 'Nothing to print yet'}
      </p>
      {object.type === 'lettering' ? (
        <LetteringProps object={object} dispatch={dispatch} />
      ) : object.type === 'stripe' ? (
        <StripeProps object={object} dispatch={dispatch} />
      ) : (
        <ShapeProps object={object} dispatch={dispatch} tools={tools} />
      )}
      <h3>Arrange</h3>
      <div className="actions">
        <button
          type="button"
          disabled={index >= doc.objects.length - 1}
          onClick={() => dispatch({ type: 'reorder', id: object.id, direction: 1, at: at() })}
        >
          Bring forward
        </button>
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => dispatch({ type: 'reorder', id: object.id, direction: -1, at: at() })}
        >
          Send back
        </button>
        <button type="button" onClick={() => dispatch({ type: 'duplicate', id: object.id, at: at() })}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={() => dispatch({ type: 'remove', id: object.id, at: at() })}>
          Delete
        </button>
      </div>
    </section>
  );
}

function LetteringProps({ object, dispatch }: { object: LetteringObject; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<LetteringObject>, key?: string) =>
    dispatch({ type: 'update', id: object.id, patch, key: key && `${object.id}:${key}`, at: Date.now() });
  return (
    <>
      <TextField label={object.role === 'number' ? 'Number' : 'Text'} value={object.text} onChange={(text) => set({ text }, 'text')} />
      <Field label="Font">
        {(id) => (
          <select id={id} value={object.fontId} onChange={(e) => set({ fontId: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="row">
        <NumberField label="Letter height" value={object.capHeight} min={1} max={3000} step={5} onChange={(capHeight) => set({ capHeight }, 'cap')} />
        <NumberField label="Spacing" value={object.letterSpacing} min={-200} max={500} onChange={(letterSpacing) => set({ letterSpacing }, 'spacing')} />
      </div>
      <div className="row">
        <NumberField label="Lean" unit="°" value={object.slant} min={-45} max={45} onChange={(slant) => set({ slant }, 'slant')} />
        <NumberField label="Rotation" unit="°" value={object.rotation} min={-180} max={180} onChange={(rotation) => set({ rotation }, 'rot')} />
      </div>
      <div className="row">
        <NumberField label="Left" value={object.x} step={1} onChange={(x) => set({ x }, 'x')} />
        <NumberField label="Baseline" value={object.y} step={1} onChange={(y) => set({ y }, 'y')} />
      </div>

      <h3>Colour</h3>
      <SwatchField label="Fill" value={object.fill} onChange={(fill) => fill && set({ fill })} />
      <NumberField label="Outline width" value={object.outlineWidth} min={0} max={200} onChange={(outlineWidth) => set({ outlineWidth }, 'outline')} />
      {object.outlineWidth > 0 && (
        <>
          <SwatchField label="Outline colour" value={object.outlineColor} onChange={(outlineColor) => outlineColor && set({ outlineColor })} />
          <Choice
            label="Outline corners"
            value={object.corner}
            options={[
              { value: 'sharp', label: 'Sharp' },
              { value: 'round', label: 'Round' },
            ]}
            onChange={(corner) => set({ corner })}
          />
        </>
      )}

      <h3 className="cut-heading">Cutting</h3>
      <Choice
        label="Cut as"
        value={object.cutMode}
        options={[
          { value: 'perCharacter', label: 'Each character' },
          { value: 'singlePiece', label: 'One piece' },
        ]}
        onChange={(cutMode) => set({ cutMode })}
      />
      {object.cutMode === 'singlePiece' ? (
        <>
          <NumberField label="Margin around the artwork" value={object.plateMargin} min={0} max={300} onChange={(plateMargin) => set({ plateMargin }, 'margin')} />
          <SwatchField label="Background" value={object.plateColor} allowNone onChange={(plateColor) => set({ plateColor })} />
        </>
      ) : (
        <p className="hint">Every character becomes its own sticker and needs application tape to keep its spacing.</p>
      )}
    </>
  );
}

function StripeProps({ object, dispatch }: { object: StripeObject; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<StripeObject>, key?: string) =>
    dispatch({ type: 'update', id: object.id, patch, key: key && `${object.id}:${key}`, at: Date.now() });
  return (
    <>
      <div className="row">
        <NumberField label="Length" value={object.length} min={1} max={20000} step={10} onChange={(length) => set({ length }, 'length')} />
        <NumberField label="Bands" unit="" value={object.bands} min={1} max={20} integer onChange={(bands) => set({ bands }, 'bands')} />
      </div>
      <div className="row">
        <NumberField label="Band width" value={object.bandWidth} min={0.5} max={2000} onChange={(bandWidth) => set({ bandWidth }, 'band')} />
        <NumberField label="Gap" value={object.gap} min={0} max={2000} onChange={(gap) => set({ gap }, 'gap')} />
      </div>
      <div className="row">
        <NumberField label="End angle" unit="°" value={object.endSlant} min={-75} max={75} onChange={(endSlant) => set({ endSlant }, 'end')} />
        <NumberField label="Rotation" unit="°" value={object.rotation} min={-180} max={180} onChange={(rotation) => set({ rotation }, 'rot')} />
      </div>
      <div className="row">
        <NumberField label="Left" value={object.x} onChange={(x) => set({ x }, 'x')} />
        <NumberField label="Top" value={object.y} onChange={(y) => set({ y }, 'y')} />
      </div>
      <h3>Colour</h3>
      <SwatchField label="Fill" value={object.color} onChange={(color) => color && set({ color })} />
    </>
  );
}

function ShapeProps({ object, dispatch, tools }: { object: ShapeObject; dispatch: Dispatch<Action>; tools: ShapeTools }) {
  const set = (patch: Partial<ShapeObject>, key?: string) =>
    dispatch({ type: 'update', id: object.id, patch, key: key && `${object.id}:${key}`, at: Date.now() });
  const natural = ringsBox(object.parts.flatMap((p) => flatten(p.path, 0.05)));
  const nw = natural ? natural.x2 - natural.x1 : 0;
  const nh = natural ? natural.y2 - natural.y1 : 0;
  const colours = new Set(object.parts.map((p) => p.color)).size;
  return (
    <>
      <TextField label="Name" value={object.name} onChange={(name) => set({ name }, 'name')} />
      <div className="row">
        <NumberField
          label="Width"
          value={nw * object.sx}
          min={0.5}
          max={20000}
          onChange={(w) => nw > 0 && set(object.lockRatio ? { sx: w / nw, sy: (object.sy * (w / nw)) / object.sx } : { sx: w / nw }, 'w')}
        />
        <NumberField
          label="Height"
          value={nh * object.sy}
          min={0.5}
          max={20000}
          onChange={(h) => nh > 0 && set(object.lockRatio ? { sy: h / nh, sx: (object.sx * (h / nh)) / object.sy } : { sy: h / nh }, 'h')}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={object.lockRatio} onChange={(e) => set({ lockRatio: e.target.checked })} />
        Keep proportions
      </label>
      <div className="row">
        <NumberField label="Left" value={object.x} onChange={(x) => set({ x }, 'x')} />
        <NumberField label="Top" value={object.y} onChange={(y) => set({ y }, 'y')} />
      </div>
      <NumberField label="Rotation" unit="°" value={object.rotation} min={-180} max={180} onChange={(rotation) => set({ rotation }, 'rot')} />

      <h3>Colour</h3>
      {colours === 1 ? (
        <SwatchField
          label="Fill"
          value={object.parts[0].color}
          onChange={(color) => color && set({ parts: object.parts.map((p) => ({ ...p, color })) })}
        />
      ) : (
        <p className="hint">This artwork keeps the {colours} colours from its file. Print colours are converted from screen colours, so check a printed proof.</p>
      )}

      <h3>Shape</h3>
      {tools.editing ? (
        <>
          <p className="hint">Drag the square points on the sheet. Click a point to see its curve handles.</p>
          <div className="actions">
            <button type="button" disabled={!tools.hasActivePoint} onClick={() => tools.onPointAction('add')}>
              Add point after
            </button>
            <button type="button" disabled={!tools.hasActivePoint} onClick={() => tools.onPointAction('delete')}>
              Delete point
            </button>
            <button type="button" className="wide" onClick={() => tools.onEditPoints(false)}>
              Finish editing points
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button type="button" className="wide" onClick={() => tools.onEditPoints(true)}>
            Edit points
          </button>
        </div>
      )}
      {tools.extraShapes.length > 0 && (
        <>
          <p className="hint combine-hint">{tools.extraShapes.length + 1} shapes selected. The one furthest back keeps its colour.</p>
          <div className="actions three">
            <button type="button" onClick={() => tools.onCombine('unite')}>
              Unite
            </button>
            <button type="button" onClick={() => tools.onCombine('subtract')}>
              Subtract
            </button>
            <button type="button" onClick={() => tools.onCombine('intersect')}>
              Intersect
            </button>
          </div>
        </>
      )}

      <h3 className="cut-heading">Cutting</h3>
      <Choice
        label="Cut as"
        value={object.cutMode}
        options={[
          { value: 'contour', label: 'Along the outline' },
          { value: 'singlePiece', label: 'One piece' },
        ]}
        onChange={(cutMode) => set({ cutMode })}
      />
      {object.cutMode === 'singlePiece' && (
        <>
          <NumberField label="Margin around the artwork" value={object.plateMargin} min={0} max={300} onChange={(plateMargin) => set({ plateMargin }, 'margin')} />
          <SwatchField label="Background" value={object.plateColor} allowNone onChange={(plateColor) => set({ plateColor })} />
        </>
      )}
    </>
  );
}

function Checks({ warnings, dispatch }: { warnings: Warning[]; dispatch: Dispatch<Action> }) {
  return (
    <section className="checks" aria-live="polite">
      <h3>Before you export</h3>
      {warnings.length === 0 ? (
        <p className="ok">No problems found. Cut lines are closed and nothing leaves the sheet.</p>
      ) : (
        <ul>
          {warnings.map((w, i) => (
            <li key={i}>
              {w.objectId ? (
                <button type="button" onClick={() => dispatch({ type: 'select', id: w.objectId })}>
                  {w.message}
                </button>
              ) : (
                w.message
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
