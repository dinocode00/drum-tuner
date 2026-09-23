// In-place iterative radix-2 complex FFT with cached tables per size.

const tables = new Map();

function getTables(n) {
  let t = tables.get(n);
  if (t) return t;
  const bits = Math.log2(n);
  if (!Number.isInteger(bits)) throw new Error('FFT size must be a power of 2');
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  t = { rev, cos, sin };
  tables.set(n, t);
  return t;
}

export function fft(re, im) {
  const n = re.length;
  const { rev, cos, sin } = getTables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/**
 * Hann-windowed, zero-padded magnitude spectrum in dB.
 * Returns { db: Float32Array (n/2 bins), binHz }.
 */
export function magnitudeSpectrum(samples, sampleRate, fftSize) {
  const n = fftSize;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const len = Math.min(samples.length, n);
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
    re[i] = samples[i] * w;
  }
  fft(re, im);
  const db = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    db[i] = 10 * Math.log10(re[i] * re[i] + im[i] * im[i] + 1e-20);
  }
  return { db, binHz: sampleRate / n };
}
