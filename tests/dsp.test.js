import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHit, HitDetector } from '../js/dsp/pitch.js';
import { renderDrum, renderLugTap } from '../js/audio/drumsynth.js';
import { freqToNote, centsBetween, parseNote, describeInterval } from '../js/dsp/notes.js';

const SR = 48000;

function noise(n, amp, seed = 7) {
  let s = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = amp * ((s / 4294967296) * 2 - 1);
  }
  return out;
}

function addNoise(sig, amp) {
  const nz = noise(sig.length, amp);
  return sig.map((v, i) => v + nz[i]);
}

test('note helpers', () => {
  assert.deepEqual(freqToNote(440), { midi: 69, name: 'A4', cents: 0 });
  assert.equal(freqToNote(73.42).name, 'D2');
  assert.equal(parseNote('F#3'), 54);
  assert.equal(parseNote('Bb2'), 46);
  assert.ok(Math.abs(centsBetween(880, 440) - 1200) < 1e-9);
  assert.equal(describeInterval(440 * 1.5, 440).name, 'Perfect 5th');
});

for (const [type, f, diameter] of [
  ['tom', 147, 10],
  ['tom', 110, 12],
  ['floor', 73.4, 16],
  ['snare', 185, 14],
  ['kick', 55, 22],
]) {
  test(`center hit fundamental: ${type} ${f} Hz`, () => {
    for (const resonance of ['max', 'medium', 'low']) {
      const sig = addNoise(renderDrum({ fundamental: f, type, diameter, resonance, sampleRate: SR }), 0.003);
      const r = analyzeHit(sig, SR, { mode: 'center', fmin: type === 'kick' ? 30 : 40, fmax: 450 });
      assert.ok(r, 'result');
      const cents = Math.abs(centsBetween(r.f0, f));
      // The synth includes an intentional pitch drop, so allow a little sharpness.
      assert.ok(cents < 25, `${type} ${resonance}: got ${r.f0.toFixed(1)} Hz, want ${f} (${cents.toFixed(1)}¢)`);
    }
  });
}

test('lug tap pitch, with and without focus', () => {
  for (const lug of [120, 190, 257, 330, 410]) {
    const sig = addNoise(renderLugTap(lug, SR), 0.003);
    const plain = analyzeHit(sig, SR, { mode: 'lug', fmin: 50, fmax: 1200 });
    assert.ok(Math.abs(centsBetween(plain.freq, lug)) < 20, `lug ${lug}: got ${plain.freq}`);
    const focused = analyzeHit(sig, SR, { mode: 'lug', fmin: 50, fmax: 1200, focusHz: lug * 1.1 });
    assert.ok(Math.abs(centsBetween(focused.freq, lug)) < 20, `focused lug ${lug}: got ${focused.freq}`);
  }
});

test('pure tone accuracy is sub-cent', () => {
  const f = 196.3;
  const sig = new Float32Array(SR * 0.5).map((_, i) => Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / SR));
  const r = analyzeHit(sig, SR, { mode: 'center' });
  assert.ok(Math.abs(centsBetween(r.freq, f)) < 1, `got ${r.freq}`);
});

test('detector finds each hit in a stream', () => {
  const hits = [];
  const det = new HitDetector(SR, { onHit: (s) => hits.push(analyzeHit(s, SR, { mode: 'center' })) });
  const gap = noise(SR * 0.6, 0.002, 3);
  const parts = [gap];
  for (const f of [100, 150, 200]) {
    parts.push(renderDrum({ fundamental: f, type: 'tom', diameter: 12, resonance: 'medium', sampleRate: SR }));
    parts.push(noise(SR * 0.4, 0.002, f));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const stream = new Float32Array(total);
  let o = 0;
  for (const p of parts) { stream.set(p, o); o += p.length; }
  for (let i = 0; i < stream.length; i += 1024) det.push(stream.subarray(i, i + 1024));
  assert.equal(hits.length, 3, `detected ${hits.length} hits`);
  [100, 150, 200].forEach((f, i) => assert.ok(Math.abs(centsBetween(hits[i].f0, f)) < 25, `hit ${i}: ${hits[i].f0}`));
});

test('detector ignores steady background noise', () => {
  const hits = [];
  const det = new HitDetector(SR, { onHit: (s) => hits.push(s) });
  const n = noise(SR * 3, 0.02, 11);
  for (let i = 0; i < n.length; i += 512) det.push(n.subarray(i, i + 512));
  assert.equal(hits.length, 0);
});
