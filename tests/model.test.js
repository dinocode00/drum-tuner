import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starOrder, lugTargets, suggestFundamental, kitIntervals, defaultKit, estimateFundamental } from '../js/tuning/model.js';
import { freqToNote } from '../js/dsp/notes.js';

test('star order visits every lug once and alternates across', () => {
  for (let n = 3; n <= 16; n++) {
    const o = starOrder(n);
    assert.equal(o.length, n);
    assert.equal(new Set(o).size, n);
  }
  assert.deepEqual(starOrder(8), [0, 4, 2, 6, 1, 5, 3, 7]);
  assert.deepEqual(starOrder(6), [0, 3, 2, 5, 1, 4]);
  assert.deepEqual(starOrder(5), [0, 2, 4, 1, 3]);
});

test('lug targets follow Tune-Bot ratios', () => {
  const t = lugTargets({ fundamental: 100, resonance: 'max', higherHead: 'reso' });
  assert.ok(Math.abs(t.batter - 175) < 1e-9 && Math.abs(t.reso - 175) < 1e-9);
  const m = lugTargets({ fundamental: 100, resonance: 'medium', higherHead: 'reso' });
  assert.ok(Math.abs(m.batter - 140) < 1e-9 && Math.abs(m.reso - 200) < 1e-9);
  const b = lugTargets({ fundamental: 100, resonance: 'medium', higherHead: 'batter' });
  assert.ok(Math.abs(b.batter - 200) < 1e-9);
  const est = estimateFundamental({ resonance: 'medium', higherHead: 'reso' }, 140, 200);
  assert.ok(Math.abs(est - 100) < 1e-9);
});

test('suggested fundamentals match the Tune-Bot guide', () => {
  assert.equal(freqToNote(suggestFundamental('tom', 10)).name, 'D3');
  assert.equal(freqToNote(suggestFundamental('tom', 12)).name, 'B2');
  assert.equal(freqToNote(suggestFundamental('floor', 16)).name, 'D2');
  assert.equal(freqToNote(suggestFundamental('snare', 14)).name, 'F#3');
  assert.equal(freqToNote(suggestFundamental('kick', 22)).name, 'A1');
});

test('kit intervals go up from the floor tom', () => {
  const kit = defaultKit();
  const toms = kit.drums.filter((d) => d.type === 'tom' || d.type === 'floor');
  const map = kitIntervals(toms, 73.42, 'fourths');
  const names = toms.map((d) => freqToNote(map.get(d.id)).name);
  assert.deepEqual(names, ['C3', 'G2', 'D2']); // 10", 12", 16"
});

test('default kit is the Pearl Export + Canopus snare', () => {
  const kit = defaultKit();
  assert.equal(kit.drums.length, 5);
  const snare = kit.drums.find((d) => d.type === 'snare');
  assert.equal(snare.depth, 6.5);
  assert.equal(snare.lugs, 10);
});
