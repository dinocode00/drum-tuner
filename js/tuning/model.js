// Tuning model: targets, lug-pitch ratios, style presets, star patterns, kit intervals.
//
// Lug-pitch ratios follow the Overtone Labs (Tune-Bot) drum-set tuning guide:
// the pitch you hear tapping ~1" in front of a lug is a fixed multiple of the
// assembled drum's fundamental, and how far apart the two heads are sets how
// long the drum rings.

import { freqToMidi, midiToFreq } from '../dsp/notes.js';

export const RESONANCE = {
  max: { label: 'Maximum', higher: 1.75, lower: 1.75, blurb: 'Both heads equal. Longest sustain, most open and singing.' },
  high: { label: 'High', higher: 1.85, lower: 1.5, blurb: 'Long sustain with a gentle pitch drop.' },
  medium: { label: 'Medium', higher: 2.0, lower: 1.4, blurb: 'Balanced sustain; a controlled, punchy sound that records well.' },
  low: { label: 'Low', higher: 2.3, lower: 1.2, blurb: 'Short, fat and dry with a pronounced pitch drop.' },
};

export const DRUM_TYPES = {
  tom: 'Rack tom',
  floor: 'Floor tom',
  snare: 'Snare',
  kick: 'Bass drum',
};

export const STYLES = {
  low: { label: 'Low / fat', blurb: 'Deep, big tones (rock, metal, funk).' },
  medium: { label: 'Medium', blurb: 'All-purpose pop/rock tuning.' },
  high: { label: 'High / jazz', blurb: 'Tight, singing, open tones (jazz, fusion).' },
};

/** Target lug pitches for batter and resonant heads. */
export function lugTargets(drum) {
  const r = RESONANCE[drum.resonance] || RESONANCE.max;
  const resoHigher = drum.higherHead !== 'batter';
  return {
    batter: drum.fundamental * (resoHigher ? r.lower : r.higher),
    reso: drum.fundamental * (resoHigher ? r.higher : r.lower),
  };
}

/** Estimate the assembled fundamental from measured average lug pitches. */
export function estimateFundamental(drum, batterLug, resoLug) {
  const r = RESONANCE[drum.resonance] || RESONANCE.max;
  const resoHigher = drum.higherHead !== 'batter';
  const est = [];
  if (batterLug) est.push(batterLug / (resoHigher ? r.lower : r.higher));
  if (resoLug) est.push(resoLug / (resoHigher ? r.higher : r.lower));
  if (!est.length) return null;
  return est.reduce((a, b) => a + b) / est.length;
}

// Medium-style fundamentals (MIDI note numbers) by drum size, from the
// Tune-Bot guide's 4-tom example (10"=D3 … 16"=D2) and common snare/kick ranges.
const TOM_TABLE = [
  [6, 57], [8, 53], [10, 50], [12, 47], [13, 45], [14, 43], [15, 40], [16, 38], [18, 36], [20, 33],
];
const SNARE_TABLE = [[10, 61], [12, 58], [13, 56], [14, 54]];
const KICK_TABLE = [[16, 41], [18, 38], [20, 35], [22, 33], [24, 31], [26, 29]];
const STYLE_OFFSET = {
  tom: { low: -3, medium: 0, high: 5 },
  floor: { low: -3, medium: 0, high: 5 },
  snare: { low: -2, medium: 0, high: 4 },
  kick: { low: -3, medium: 0, high: 5 },
};

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/** Suggested fundamental (Hz, snapped to a note) for a drum and style. */
export function suggestFundamental(type, diameter, style = 'medium') {
  const table = type === 'snare' ? SNARE_TABLE : type === 'kick' ? KICK_TABLE : TOM_TABLE;
  const midi = Math.round(interp(table, diameter) + (STYLE_OFFSET[type] || STYLE_OFFSET.tom)[style]);
  return midiToFreq(midi);
}

/** Search range for pitch detection per drum type. */
export function detectRange(type, mode) {
  if (type === 'kick') return mode === 'lug' ? [35, 400] : [30, 160];
  if (type === 'snare') return mode === 'lug' ? [120, 1200] : [100, 450];
  return mode === 'lug' ? [50, 900] : [40, 400];
}

/**
 * Criss-cross ("star") tightening order for n lugs, 0-based, lugs numbered
 * clockwise. Even counts go across to the opposite lug, then skip ahead;
 * odd counts follow a star polygon.
 */
export function starOrder(n) {
  const order = [];
  if (n % 2 === 0) {
    const pairs = n / 2;
    const idx = [];
    if (pairs % 2 === 1) {
      // Odd number of pairs: stepping by 2 (mod pairs) visits every pair.
      for (let k = 0, i = 0; k < pairs; k++, i = (i + 2) % pairs) idx.push(i);
    } else {
      for (let i = 0; i < pairs; i += 2) idx.push(i);
      for (let i = 1; i < pairs; i += 2) idx.push(i);
    }
    for (const i of idx) order.push(i, i + pairs);
  } else {
    const step = Math.floor(n / 2);
    for (let k = 0, i = 0; k < n; k++, i = (i + step) % n) order.push(i);
  }
  return order;
}

export const KIT_PATTERNS = {
  fourths: { label: 'Perfect 4ths', offsets: [0, 5, 10, 15, 20, 25], blurb: 'Classic, strong, "rock" spacing.' },
  maj3: { label: 'Major 3rds', offsets: [0, 4, 8, 12, 16, 20], blurb: 'Closer spacing; smooth melodic fills.' },
  min3: { label: 'Minor 3rds', offsets: [0, 3, 6, 9, 12, 15], blurb: 'Tight spacing; darker.' },
  majorChord: { label: 'Major chord', offsets: [0, 4, 7, 12, 16, 19], blurb: 'Toms spell a major chord (bright, happy).' },
  minorChord: { label: 'Minor chord', offsets: [0, 3, 7, 12, 15, 19], blurb: 'Toms spell a minor chord (moody).' },
  fifths: { label: 'Perfect 5ths', offsets: [0, 7, 14, 21], blurb: 'Wide spacing; best with 2–3 toms.' },
};

/**
 * Assign fundamentals to toms (any order) from the lowest note upward.
 * @returns {Map<id, Hz>}
 */
export function kitIntervals(toms, lowestHz, patternKey) {
  const sorted = toms.slice().sort((a, b) => b.diameter - a.diameter || (a.type === 'floor' ? -1 : 1));
  const offsets = KIT_PATTERNS[patternKey].offsets;
  const base = Math.round(freqToMidi(lowestHz));
  const out = new Map();
  sorted.forEach((d, i) => {
    const off = offsets[i] ?? offsets[offsets.length - 1] + (i - offsets.length + 1) * 5;
    out.set(d.id, midiToFreq(base + off));
  });
  return out;
}

let idCounter = 0;
export function newId() {
  return `d${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

export function makeDrum({ name, type, diameter, depth, lugs, style = 'medium', resonance, higherHead = 'reso', notes = '' }) {
  return {
    id: newId(),
    name,
    type,
    diameter,
    depth,
    lugs,
    fundamental: suggestFundamental(type, diameter, style),
    resonance: resonance || (type === 'snare' || type === 'kick' ? 'medium' : 'high'),
    higherHead,
    notes,
  };
}

/** The user's kit: Pearl Export 5-piece with a Canopus Yaiba aluminum snare. */
export function defaultKit() {
  return {
    name: 'Pearl Export',
    drums: [
      makeDrum({ name: 'Snare', type: 'snare', diameter: 14, depth: 6.5, lugs: 10, notes: 'Canopus Yaiba 14×6.5 aluminum' }),
      makeDrum({ name: 'Rack tom 1', type: 'tom', diameter: 10, depth: 7, lugs: 6 }),
      makeDrum({ name: 'Rack tom 2', type: 'tom', diameter: 12, depth: 8, lugs: 6 }),
      makeDrum({ name: 'Floor tom', type: 'floor', diameter: 16, depth: 16, lugs: 8 }),
      makeDrum({ name: 'Bass drum', type: 'kick', diameter: 22, depth: 18, lugs: 10 }),
    ],
  };
}

export function drumLabel(d) {
  return `${d.diameter}″ ${DRUM_TYPES[d.type] || d.type}`;
}
