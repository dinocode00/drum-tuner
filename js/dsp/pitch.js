// Drum-hit pitch analysis.
//
// Drums are inharmonic, so autocorrelation-style pitch trackers made for
// voices/strings mislead. Instead we take one high-resolution FFT of the
// ringing part of the hit (just after the stick transient) and pick spectral
// peaks the way a drummer's ear does:
//   - center hit  -> fundamental: the lowest strong peak (the (0,1) mode)
//   - lug tap     -> lug pitch: the strongest peak, optionally focused
//                    around an expected frequency to ignore stray overtones

import { magnitudeSpectrum } from './fft.js';

const DEFAULTS = {
  mode: 'center', // 'center' | 'lug'
  fmin: 40,
  fmax: 1200,
  skipMs: 30, // ignore the stick attack
  windowMs: 300,
  focusHz: 0, // lug mode: only accept peaks near this frequency when > 0
  focusRatio: 1.4,
};

function nextPow2(n) {
  return 1 << Math.ceil(Math.log2(n));
}

/** Find local-maximum peaks in a dB spectrum within [fmin, fmax]. */
export function findPeaks(db, binHz, fmin, fmax, nativeBinHz, rangeDb = 40) {
  const lo = Math.max(2, Math.floor(fmin / binHz));
  const hi = Math.min(db.length - 3, Math.ceil(fmax / binHz));
  let maxDb = -Infinity;
  for (let i = lo; i <= hi; i++) if (db[i] > maxDb) maxDb = db[i];
  // A true peak must dominate ~2 native (un-padded) bins either side,
  // which rejects Hann side-lobes and zero-padding ripple.
  const guard = Math.max(2, Math.round((2 * nativeBinHz) / binHz));
  const peaks = [];
  for (let i = lo; i <= hi; i++) {
    const v = db[i];
    if (v < maxDb - rangeDb) continue;
    let isMax = true;
    for (let k = 1; k <= guard && isMax; k++) {
      if ((i - k >= 0 && db[i - k] > v) || (i + k < db.length && db[i + k] >= v)) isMax = false;
    }
    if (!isMax) continue;
    // Parabolic interpolation on the dB values for sub-bin accuracy.
    const a = db[i - 1];
    const b = db[i];
    const c = db[i + 1];
    const denom = a - 2 * b + c;
    const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    peaks.push({ freq: (i + delta) * binHz, db: b - 0.25 * (a - c) * delta });
  }
  return { peaks, maxDb };
}

/**
 * Analyze one drum hit.
 * @param {Float32Array} samples audio starting at (or shortly before) the onset
 * @param {number} sampleRate
 * @param {object} options see DEFAULTS
 * @returns {null | {freq, f0, f1, peaks, spectrum, confidence}}
 */
export function analyzeHit(samples, sampleRate, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const start = Math.round((opt.skipMs / 1000) * sampleRate);
  const want = Math.round((opt.windowMs / 1000) * sampleRate);
  const len = Math.min(want, samples.length - start);
  if (len < sampleRate * 0.05) return null;
  const seg = samples.subarray(start, start + len);

  const fftSize = Math.min(65536, Math.max(16384, nextPow2(len * 4)));
  const { db, binHz } = magnitudeSpectrum(seg, sampleRate, fftSize);
  const nativeBinHz = sampleRate / len;
  const { peaks, maxDb } = findPeaks(db, binHz, opt.fmin, opt.fmax, nativeBinHz);
  if (!peaks.length) return null;

  // Noise reference: median level in the search band.
  const lo = Math.floor(opt.fmin / binHz);
  const hi = Math.min(db.length - 1, Math.ceil(opt.fmax / binHz));
  const band = Array.from(db.subarray(lo, hi)).sort((x, y) => x - y);
  const median = band[Math.floor(band.length / 2)];

  const strongest = peaks.reduce((p, q) => (q.db > p.db ? q : p));

  // Fundamental: the lowest peak that is within 15 dB of the strongest.
  const f0Peak = peaks.find((p) => p.db >= maxDb - 15) || strongest;
  // First overtone ((1,1) mode) sits roughly 1.35–1.8x above the fundamental.
  let f1Peak = null;
  for (const p of peaks) {
    if (p.freq > f0Peak.freq * 1.3 && p.freq < f0Peak.freq * 1.85 && (!f1Peak || p.db > f1Peak.db)) f1Peak = p;
  }

  // Drums bend down in pitch right after the hit (the head is briefly more
  // stretched). Re-measure on the settled tail if it still rings clearly.
  const settle = (peak) => {
    const lateStart = start + Math.round(0.12 * sampleRate);
    const lateLen = Math.min(Math.round(0.3 * sampleRate), samples.length - lateStart);
    if (lateLen < sampleRate * 0.12) return peak;
    const late = magnitudeSpectrum(samples.subarray(lateStart, lateStart + lateLen), sampleRate, fftSize);
    const found = findPeaks(late.db, late.binHz, peak.freq / 1.1, peak.freq * 1.03, sampleRate / lateLen, 20);
    if (!found.peaks.length) return peak;
    const best = found.peaks.reduce((p, q) => (q.db > p.db ? q : p));
    const lo2 = Math.floor(opt.fmin / binHz);
    const hi2 = Math.min(late.db.length - 1, Math.ceil(opt.fmax / binHz));
    const sorted = Array.from(late.db.subarray(lo2, hi2)).sort((x, y) => x - y);
    const lateMedian = sorted[Math.floor(sorted.length / 2)];
    return best.db > lateMedian + 20 ? { freq: best.freq, db: peak.db } : peak;
  };

  let chosen;
  if (opt.mode === 'lug') {
    chosen = strongest;
    if (opt.focusHz > 0) {
      const inFocus = peaks.filter(
        (p) => p.freq > opt.focusHz / opt.focusRatio && p.freq < opt.focusHz * opt.focusRatio && p.db >= maxDb - 25,
      );
      if (inFocus.length) chosen = inFocus.reduce((p, q) => (q.db > p.db ? q : p));
    }
  } else {
    chosen = f0Peak;
  }

  const settledF0 = settle(f0Peak);
  const settledChosen = chosen === f0Peak ? settledF0 : settle(chosen);

  return {
    freq: settledChosen.freq,
    f0: settledF0.freq,
    f1: f1Peak ? f1Peak.freq : null,
    peaks: peaks
      .slice()
      .sort((p, q) => q.db - p.db)
      .slice(0, 12)
      .sort((p, q) => p.freq - q.freq),
    spectrum: { db, binHz, maxDb },
    confidence: Math.max(0, Math.min(1, (chosen.db - median - 10) / 30)),
  };
}

/**
 * Streaming onset detector. Feed it mic blocks; it calls onHit(samples)
 * with a buffer that starts a few ms before each detected drum hit.
 */
export class HitDetector {
  constructor(sampleRate, { captureMs = 560, preRollMs = 8, refractoryMs = 280, sensitivity = 0.5, onHit, onLevel } = {}) {
    this.sampleRate = sampleRate;
    this.hop = 256;
    this.captureLen = Math.round((captureMs / 1000) * sampleRate);
    this.preRoll = Math.round((preRollMs / 1000) * sampleRate);
    this.refractory = Math.round((refractoryMs / 1000) * sampleRate);
    this.onHit = onHit;
    this.onLevel = onLevel;
    this.setSensitivity(sensitivity);

    this.ring = new Float32Array(nextPow2(sampleRate * 2));
    this.mask = this.ring.length - 1;
    this.writePos = 0; // total samples written
    this.hopAcc = 0;
    this.hopSum = 0;
    this.prevDb = null;
    this.floorDb = null;
    this.warmup = Math.round(0.25 * sampleRate);
    this.pendingOnset = -1; // sample index of onset waiting to be captured
    this.lastOnset = -Infinity;
  }

  /** 0 = least sensitive, 1 = most sensitive. */
  setSensitivity(s) {
    this.sensitivity = s;
    this.riseDb = 14 - 8 * s; // required jump above noise floor
    this.absDb = -38 - 20 * s; // absolute minimum level (dBFS)
  }

  push(block) {
    for (let i = 0; i < block.length; i++) {
      const v = block[i];
      this.ring[this.writePos & this.mask] = v;
      this.writePos++;
      this.hopSum += v * v;
      if (++this.hopAcc === this.hop) {
        this._onHop(10 * Math.log10(this.hopSum / this.hop + 1e-12));
        this.hopAcc = 0;
        this.hopSum = 0;
      }
    }
    if (this.pendingOnset >= 0 && this.writePos - this.pendingOnset >= this.captureLen) {
      const start = this.pendingOnset - this.preRoll;
      const out = new Float32Array(this.captureLen + this.preRoll);
      for (let i = 0; i < out.length; i++) out[i] = this.ring[(start + i) & this.mask];
      this.pendingOnset = -1;
      if (this.onHit) this.onHit(out);
    }
  }

  _onHop(levelDb) {
    const now = this.writePos;
    if (this.floorDb === null) this.floorDb = levelDb;
    if (this.prevDb === null) this.prevDb = levelDb;
    if (this.onLevel) this.onLevel(levelDb, this.floorDb);
    if (now < this.warmup) {
      // Learn the room level before listening for hits.
      this.floorDb = 0.8 * this.floorDb + 0.2 * levelDb;
      this.prevDb = levelDb;
      return;
    }
    const armed = this.pendingOnset < 0 && now - this.lastOnset > this.refractory;
    if (
      armed &&
      levelDb > this.floorDb + this.riseDb &&
      levelDb > this.absDb &&
      levelDb - this.prevDb > 6
    ) {
      // Onset lies somewhere in the previous hop; back off one hop.
      this.pendingOnset = now - this.hop;
      this.lastOnset = now;
    }
    // Track the noise floor: fall fast, rise slowly (~3 dB/s), and freeze
    // while a hit is ringing so the drum itself doesn't raise the floor.
    const ringing = now - this.lastOnset < this.captureLen * 1.5;
    if (levelDb < this.floorDb) this.floorDb = 0.7 * this.floorDb + 0.3 * levelDb;
    else if (!ringing) this.floorDb += (3 * this.hop) / this.sampleRate;
    this.floorDb = Math.max(-100, this.floorDb);
    this.prevDb = levelDb;
  }
}
