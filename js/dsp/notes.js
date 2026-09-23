// Musical note helpers (A4 = 440 Hz, equal temperament).

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Nearest note to a frequency plus the offset in cents. */
export function freqToNote(freq) {
  if (!(freq > 0)) return null;
  const midi = freqToMidi(freq);
  const nearest = Math.round(midi);
  return {
    midi: nearest,
    name: midiToName(nearest),
    cents: Math.round((midi - nearest) * 100),
  };
}

/** Cents from `ref` to `freq` (positive = freq is sharp/higher). */
export function centsBetween(freq, ref) {
  return 1200 * Math.log2(freq / ref);
}

export function formatHz(freq) {
  if (!(freq > 0)) return '—';
  return freq < 100 ? freq.toFixed(1) : Math.round(freq).toString();
}

export function formatNote(freq) {
  const n = freqToNote(freq);
  if (!n) return '—';
  if (n.cents === 0) return n.name;
  return `${n.name} ${n.cents > 0 ? '+' : '−'}${Math.abs(n.cents)}¢`;
}

/** Parse "F#3", "Gb2", "a2" -> midi number, or null. */
export function parseNote(text) {
  const m = /^\s*([A-Ga-g])([#b♯♭]?)(-?\d)\s*$/.exec(text);
  if (!m) return null;
  let pc = NOTE_NAMES.indexOf(m[1].toUpperCase());
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

export const INTERVAL_NAMES = {
  0: 'Unison',
  1: 'Minor 2nd',
  2: 'Major 2nd',
  3: 'Minor 3rd',
  4: 'Major 3rd',
  5: 'Perfect 4th',
  6: 'Tritone',
  7: 'Perfect 5th',
  8: 'Minor 6th',
  9: 'Major 6th',
  10: 'Minor 7th',
  11: 'Major 7th',
  12: 'Octave',
};

/** Describe the interval between two frequencies, e.g. "Perfect 4th +8¢". */
export function describeInterval(fHigh, fLow) {
  const cents = centsBetween(fHigh, fLow);
  const semis = Math.round(cents / 100);
  const off = Math.round(cents - semis * 100);
  const within = ((semis % 12) + 12) % 12;
  const octaves = Math.floor(semis / 12);
  let name = semis === 12 ? 'Octave' : INTERVAL_NAMES[within];
  if (octaves >= 1 && semis !== 12) name += ` + ${octaves} oct`;
  if (semis < 0) name = 'Below';
  return { semis, cents: off, name };
}
