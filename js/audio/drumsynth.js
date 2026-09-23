// Modal drum synthesizer used to preview a tuning ("what should this sound like?").
//
// A drumhead is a circular membrane: it rings at a set of inharmonic modes.
// With air loading and a second head, a tom's first modes land near
// 1 : 1.52 : 2.03 : 2.29 : 2.55 ... times the fundamental. We sum decaying
// sines at those ratios, add a short pitch drop right after the hit (tension
// modulation), a stick/beater click, and snare wires for snares.
// Pure function -> Float32Array so it can be unit-tested and rendered offline.

const MODE_RATIOS = [1, 1.52, 2.03, 2.29, 2.55, 2.88, 3.2, 3.5, 3.85, 4.2];
// Relative excitation for a center strike vs an edge (lug) tap.
const CENTER_AMPS = [1, 0.3, 0.22, 0.38, 0.12, 0.1, 0.08, 0.1, 0.05, 0.04];
const EDGE_AMPS = [0.2, 1, 0.75, 0.3, 0.55, 0.4, 0.35, 0.2, 0.2, 0.15];

// How long the fundamental rings (seconds to -60 dB) per resonance setting.
const RESONANCE_SUSTAIN = { max: 1, high: 0.72, medium: 0.48, low: 0.3 };

// Small deterministic PRNG so renders (and tests) are repeatable.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * @param {object} p
 * @param {number} p.fundamental Hz of the assembled drum
 * @param {'tom'|'floor'|'snare'|'kick'} [p.type]
 * @param {number} [p.diameter] inches
 * @param {'max'|'high'|'medium'|'low'} [p.resonance]
 * @param {'reso'|'batter'} [p.higherHead] which head is tuned higher (ignored for 'max')
 * @param {'center'|'edge'} [p.strike]
 * @param {number} [p.sampleRate]
 * @param {number} [p.velocity] 0..1
 * @param {number} [p.snareWires] 0..1 (snare only)
 */
export function renderDrum(p) {
  const sr = p.sampleRate || 48000;
  const type = p.type || 'tom';
  const f = p.fundamental;
  const diameter = p.diameter || 12;
  const resonance = p.resonance || 'max';
  const vel = p.velocity ?? 0.9;
  const strike = p.strike || 'center';
  const diff = { max: 0, high: 0.35, medium: 0.65, low: 1 }[resonance] ?? 0;

  // Bigger drums ring longer; kicks are usually muffled; snares are short.
  let t60 = (0.55 + diameter * 0.075) * (RESONANCE_SUSTAIN[resonance] || 1);
  if (type === 'kick') t60 *= 0.55;
  if (type === 'snare') t60 *= 0.55;
  const duration = Math.min(4, t60 * 1.15 + 0.1);
  const n = Math.round(duration * sr);
  const out = new Float32Array(n);

  // Pitch drop after the hit: more with larger head mismatch and for kicks.
  let bend = (0.025 + 0.05 * diff) * (0.6 + 0.8 * vel);
  if (type === 'kick') bend *= 1.6;
  if (type === 'snare') bend *= 0.5;
  // Bottom-head-higher gives a slightly "controlled", falling tone; a higher
  // batter emphasises attack (brighter upper modes).
  const attackTilt = p.higherHead === 'batter' ? 1.35 : 1;
  const bendTau = 0.045 + 0.06 * diff;

  const amps = strike === 'edge' ? EDGE_AMPS : CENTER_AMPS;
  for (let m = 0; m < MODE_RATIOS.length; m++) {
    const fm = f * MODE_RATIOS[m];
    if (fm > sr * 0.45) break;
    let a = amps[m] * (m > 0 ? attackTilt : 1) * (m > 0 ? 0.5 + 0.5 * vel : 1);
    // Phone speakers can't reproduce kick fundamentals; keep a bit more body up top.
    if (type === 'kick' && m > 0) a *= 0.8;
    const dominant = strike === 'edge' ? 1 : 0;
    const tm = t60 / (1 + 0.9 * Math.abs(m - dominant));
    const decay = Math.log(1000) / tm;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const inst = fm * (1 + bend * Math.exp(-t / bendTau));
      phase += (2 * Math.PI * inst) / sr;
      out[i] += a * Math.exp(-decay * t) * Math.sin(phase);
    }
    // Two heads tuned apart split the fundamental into a close doublet,
    // heard as a faint slow beat.
    if (m === 0 && diff > 0) {
      const fb = fm * (1 + 0.006 * diff);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (2 * Math.PI * fb * (1 + bend * Math.exp(-t / bendTau))) / sr;
        out[i] += 0.15 * diff * a * Math.exp(-decay * 1.6 * t) * Math.sin(ph);
      }
    }
  }

  // Stick/beater click: a few ms of high-passed noise.
  const rand = rng(Math.round(f * 1000));
  const clickLen = Math.round(sr * (type === 'kick' ? 0.012 : 0.006));
  const clickAmp = (type === 'kick' ? 0.5 : 0.35) * vel * attackTilt;
  let prev = 0;
  for (let i = 0; i < clickLen && i < n; i++) {
    const w = rand();
    const hp = w - prev;
    prev = w;
    out[i] += clickAmp * hp * Math.exp(-i / (clickLen / 4));
  }

  // Snare wires: band-limited noise with its own short decay.
  if (type === 'snare') {
    const wires = p.snareWires ?? 0.8;
    const wireDecay = Math.log(1000) / 0.22;
    // Simple two-pole resonant bandpass around 5 kHz, broad Q.
    const fc = 5000 / sr;
    const r = 0.86;
    const c1 = 2 * r * Math.cos(2 * Math.PI * fc);
    const c2 = -r * r;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = rand();
      const y = x + c1 * y1 + c2 * y2;
      y2 = y1;
      y1 = y;
      const onset = Math.min(1, i / (sr * 0.002));
      out[i] += 0.1 * wires * vel * onset * y * Math.exp((-wireDecay * i) / sr);
    }
  }

  // Short fade-in (avoid click artifacts) and fade-out, then normalize.
  const fadeIn = Math.round(sr * 0.0008);
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeOut = Math.round(sr * 0.05);
  for (let i = 0; i < fadeOut; i++) out[n - 1 - i] *= i / fadeOut;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? (0.85 * vel) / peak : 0;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/**
 * A tap near one lug on a single head (the other head muted), used to
 * preview a lug-pitch reference.
 */
export function renderLugTap(freq, sampleRate = 48000) {
  return renderDrum({ fundamental: freq / MODE_RATIOS[1], type: 'tom', diameter: 10, resonance: 'low', strike: 'edge', sampleRate, velocity: 0.6 });
}
