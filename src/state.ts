// Editor state: the document, selection, and undo history.

import { newDoc, newId } from './model/defaults';
import type { DesignObject, Doc } from './model/types';

export interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  selectedId: string | null;
  /** Edits sharing a key within a short time collapse into one undo step. */
  lastKey: string | null;
  lastAt: number;
}

export type Action =
  | { type: 'update'; id: string; patch: Partial<DesignObject>; key?: string; at: number }
  | { type: 'doc'; patch: Partial<Doc>; key?: string; at: number }
  | { type: 'add'; object: DesignObject; at: number }
  | { type: 'remove'; id: string; at: number }
  | { type: 'duplicate'; id: string; at: number }
  | { type: 'reorder'; id: string; direction: 1 | -1; at: number }
  | { type: 'select'; id: string | null }
  | { type: 'load'; doc: Doc; at: number }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 200;
const MERGE_WINDOW_MS = 1200;
const STORAGE_KEY = 'motorsport-graphics-studio.doc.v1';

function commit(state: State, doc: Doc, at: number, key?: string): State {
  const merge = key !== undefined && key === state.lastKey && at - state.lastAt < MERGE_WINDOW_MS;
  return {
    ...state,
    doc,
    past: merge ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    lastKey: key ?? null,
    lastAt: at,
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'update': {
      const objects = state.doc.objects.map((o) =>
        o.id === action.id ? ({ ...o, ...action.patch } as DesignObject) : o
      );
      return commit(state, { ...state.doc, objects }, action.at, action.key);
    }
    case 'doc':
      return commit(state, { ...state.doc, ...action.patch }, action.at, action.key);
    case 'add': {
      const next = commit(state, { ...state.doc, objects: [...state.doc.objects, action.object] }, action.at);
      return { ...next, selectedId: action.object.id };
    }
    case 'remove': {
      const objects = state.doc.objects.filter((o) => o.id !== action.id);
      const next = commit(state, { ...state.doc, objects }, action.at);
      return { ...next, selectedId: state.selectedId === action.id ? null : state.selectedId };
    }
    case 'duplicate': {
      const source = state.doc.objects.find((o) => o.id === action.id);
      if (!source) return state;
      const copy = { ...source, id: newId(), x: source.x + 20, y: source.y + 20 };
      const next = commit(state, { ...state.doc, objects: [...state.doc.objects, copy] }, action.at);
      return { ...next, selectedId: copy.id };
    }
    case 'reorder': {
      const objects = [...state.doc.objects];
      const from = objects.findIndex((o) => o.id === action.id);
      const to = from + action.direction;
      if (from < 0 || to < 0 || to >= objects.length) return state;
      [objects[from], objects[to]] = [objects[to], objects[from]];
      return commit(state, { ...state.doc, objects }, action.at);
    }
    case 'select':
      return { ...state, selectedId: action.id };
    case 'load': {
      const next = commit(state, action.doc, action.at);
      return { ...next, selectedId: null };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const doc = state.past[state.past.length - 1];
      return {
        ...state,
        doc,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        lastKey: null,
        selectedId: doc.objects.some((o) => o.id === state.selectedId) ? state.selectedId : null,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const doc = state.future[0];
      return {
        ...state,
        doc,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        lastKey: null,
        selectedId: doc.objects.some((o) => o.id === state.selectedId) ? state.selectedId : null,
      };
    }
  }
}

/** Accepts a parsed project file if it has the expected shape. */
export function parseDoc(value: unknown): Doc | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as Partial<Doc>;
  if (doc.version !== 1 || !Array.isArray(doc.objects) || !doc.artboard) return null;
  if (!(doc.artboard.width > 0) || !(doc.artboard.height > 0)) return null;
  const objects = doc.objects.filter(
    (o) => o && typeof o.id === 'string' && (o.type === 'lettering' || o.type === 'stripe')
  );
  const base = newDoc();
  return {
    version: 1,
    name: typeof doc.name === 'string' ? doc.name : base.name,
    artboard: { width: doc.artboard.width, height: doc.artboard.height },
    bleed: typeof doc.bleed === 'number' && doc.bleed >= 0 ? doc.bleed : base.bleed,
    cutName: typeof doc.cutName === 'string' && doc.cutName ? doc.cutName : base.cutName,
    objects,
  };
}

export function initialState(): State {
  let doc = newDoc();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) doc = parseDoc(JSON.parse(saved)) ?? doc;
  } catch {
    // Storage can be unavailable (private windows); start with the sample design.
  }
  return { doc, past: [], future: [], selectedId: null, lastKey: null, lastAt: 0 };
}

export function saveLocally(doc: Doc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Nothing to do: the project can still be saved to a file.
  }
}
