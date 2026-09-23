// App state persisted to localStorage.

import { defaultKit, newId } from './tuning/model.js';

const KEY = 'drumtuner.v1';

function blankReadings(drum) {
  return { batter: new Array(drum.lugs).fill(null), reso: new Array(drum.lugs).fill(null), center: null, f1: null, at: null };
}

function initialState() {
  const kit = defaultKit();
  return {
    kit,
    readings: Object.fromEntries(kit.drums.map((d) => [d.id, blankReadings(d)])),
    tunings: [],
    ui: { tab: 'tune', drumId: kit.drums[1].id, head: 'batter', mode: 'lugs', lugRef: 'target' },
    settings: { sensitivity: 0.5, focus: true, wakeLock: true },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = initialState();
      return { ...base, ...s, ui: { ...base.ui, ...s.ui }, settings: { ...base.settings, ...s.settings } };
    }
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return initialState();
}

export const state = load();
const listeners = new Set();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or full: keep working in memory */
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function commit() {
  save();
  listeners.forEach((fn) => fn(state));
}

export function currentDrum() {
  return state.kit.drums.find((d) => d.id === state.ui.drumId) || state.kit.drums[0];
}

export function readingsFor(drum) {
  let r = state.readings[drum.id];
  if (!r) r = state.readings[drum.id] = blankReadings(drum);
  // Lug count may have changed in the editor.
  for (const head of ['batter', 'reso']) {
    if (r[head].length !== drum.lugs) {
      r[head] = Array.from({ length: drum.lugs }, (_, i) => r[head][i] ?? null);
    }
  }
  return r;
}

export function clearReadings(drum, head) {
  const r = readingsFor(drum);
  if (head) r[head] = new Array(drum.lugs).fill(null);
  else state.readings[drum.id] = blankReadings(drum);
}

export function addDrum(drum) {
  state.kit.drums.push(drum);
  state.readings[drum.id] = blankReadings(drum);
}

export function removeDrum(id) {
  state.kit.drums = state.kit.drums.filter((d) => d.id !== id);
  delete state.readings[id];
  if (state.ui.drumId === id && state.kit.drums.length) state.ui.drumId = state.kit.drums[0].id;
}

/** Save the kit's current targets as a named tuning preset. */
export function saveTuning(name) {
  state.tunings.unshift({
    id: newId(),
    name,
    at: Date.now(),
    drums: state.kit.drums.map(({ id, fundamental, resonance, higherHead }) => ({ id, fundamental, resonance, higherHead })),
  });
}

export function loadTuning(id) {
  const t = state.tunings.find((x) => x.id === id);
  if (!t) return;
  for (const saved of t.drums) {
    const d = state.kit.drums.find((x) => x.id === saved.id);
    if (d) Object.assign(d, { fundamental: saved.fundamental, resonance: saved.resonance, higherHead: saved.higherHead });
  }
}

export function deleteTuning(id) {
  state.tunings = state.tunings.filter((t) => t.id !== id);
}

export function exportData() {
  return JSON.stringify({ app: 'drum-tuner', version: 1, kit: state.kit, tunings: state.tunings }, null, 2);
}

export function importData(text) {
  const data = JSON.parse(text);
  if (!data || !data.kit || !Array.isArray(data.kit.drums)) throw new Error('Not a drum tuner export file.');
  for (const d of data.kit.drums) {
    if (!(d.fundamental > 0) || !(d.lugs > 0) || !d.id) throw new Error('Export file has an invalid drum.');
  }
  state.kit = data.kit;
  state.tunings = Array.isArray(data.tunings) ? data.tunings : [];
  state.readings = Object.fromEntries(state.kit.drums.map((d) => [d.id, blankReadings(d)]));
  state.ui.drumId = state.kit.drums[0].id;
}

export function resetAll() {
  const fresh = initialState();
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh);
}
