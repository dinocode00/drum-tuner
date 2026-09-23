// Tune tab: lug tuning, fundamental pitch, spectrum.

import { h, s, seg, icons } from './dom.js';
import { state, currentDrum, readingsFor } from '../store.js';
import { lugTargets, starOrder, estimateFundamental, RESONANCE, drumLabel } from '../tuning/model.js';
import { formatHz, formatNote, centsBetween, describeInterval } from '../dsp/notes.js';

export const IN_TUNE_CENTS = 5;

export function verdict(cents, { whole = false } = {}) {
  if (cents == null || !isFinite(cents)) return null;
  const a = Math.abs(cents);
  if (a <= IN_TUNE_CENTS) return { cls: 'good', text: 'In tune ✓' };
  const amount = a <= 15 ? ' slightly' : a <= 50 ? '' : ' a lot';
  if (cents < 0) return { cls: 'flat', text: whole ? `Too low · tighten evenly${amount}` : `Tighten${amount}` };
  return { cls: 'sharp', text: whole ? `Too high · loosen evenly${amount}` : `Loosen${amount}` };
}

function fmtCents(c) {
  if (c == null || !isFinite(c)) return '';
  const r = Math.round(c);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}¢`;
}

function lugColor(cents) {
  if (cents == null) return { fill: '#20232a', stroke: '#3a3f4a', ink: '#9aa1ad' };
  const a = Math.abs(cents);
  if (a <= IN_TUNE_CENTS) return { fill: '#3ddc84', stroke: '#3ddc84', ink: '#062012' };
  const t = Math.min(1, a / 60);
  const base = cents < 0 ? [77, 163, 255] : [255, 107, 91];
  const mix = (x) => Math.round(32 + (x - 32) * (0.35 + 0.65 * t));
  return { fill: `rgb(${base.map(mix).join(',')})`, stroke: `rgb(${base.join(',')})`, ink: '#0e0f12' };
}

/** Reference pitch for lug comparisons: the target, or the average of the lugs so far. */
export function lugReference(drum, head) {
  const r = readingsFor(drum)[head];
  const vals = r.filter((v) => v > 0);
  if (state.ui.lugRef === 'even') {
    if (vals.length < 2) return { hz: null, label: 'Average of lugs', vals };
    const avg = Math.exp(vals.reduce((a, v) => a + Math.log(v), 0) / vals.length);
    return { hz: avg, label: 'Average of lugs', vals };
  }
  return { hz: lugTargets(drum)[head], label: `${head === 'batter' ? 'Batter' : 'Reso'} lug target`, vals };
}

function drumHead(drum, head, session, onSelect) {
  const n = drum.lugs;
  const size = 320;
  const c = size / 2;
  const readings = readingsFor(drum)[head];
  const ref = lugReference(drum, head).hz;
  const order = starOrder(n);
  const pos = (i, r) => {
    const a = (-90 + (i * 360) / n) * (Math.PI / 180);
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const starPts = order.concat(order[0]).map((i) => pos(i, 118).join(',')).join(' ');
  const sel = session.selectedLug % n;
  const selReading = readings[sel];
  const selCents = selReading && ref ? centsBetween(selReading, ref) : null;

  return s('svg', { class: 'drumhead', viewBox: `-14 -14 ${size + 28} ${size + 28}`, role: 'group', 'aria-label': `${n}-lug drum head` },
    s('circle', { class: 'hoop', cx: c, cy: c, r: 128 }),
    s('circle', { class: 'head', cx: c, cy: c, r: 122 }),
    s('polyline', { class: 'star', points: starPts }),
    // Center readout for the selected lug
    s('text', { class: 'center-text', x: c, y: c - 30, fill: '#9aa1ad', 'font-size': 13, 'font-weight': 600 }, `Lug ${sel + 1}`),
    s('text', { class: 'center-text', x: c, y: c + 2, fill: '#eef0f4', 'font-size': 40, 'font-weight': 800 },
      selReading ? formatHz(selReading) : '—'),
    s('text', { class: 'center-text', x: c, y: c + 34, 'font-size': 16, 'font-weight': 700,
      fill: selCents == null ? '#9aa1ad' : lugColor(selCents).stroke },
      selReading ? (selCents == null ? formatNote(selReading) : `${fmtCents(selCents)} · ${verdict(selCents).text}`) : 'tap near this lug'),
    readings.map((v, i) => {
      const [x, y] = pos(i, 100);
      return v ? s('text', { class: 'lugval', x, y }, formatHz(v)) : null;
    }),
    readings.map((v, i) => {
      const [x, y] = pos(i, 146);
      const cc = v && ref ? lugColor(centsBetween(v, ref)) : v ? { fill: '#6b7280', stroke: '#9aa1ad', ink: '#0e0f12' } : lugColor(null);
      const starIdx = order.indexOf(i) + 1;
      return s('g', { class: 'lug', role: 'button', tabindex: 0, 'aria-label': `Lug ${i + 1}`, onclick: () => onSelect(i) },
        i === sel ? s('circle', { class: 'selected-ring', cx: x, cy: y, r: 23 }) : null,
        s('circle', { cx: x, cy: y, r: 17, fill: cc.fill, stroke: cc.stroke }),
        s('text', { x, y, fill: cc.ink }, String(i + 1)),
        s('title', null, `Lug ${i + 1} (star step ${starIdx})`));
    }));
}

function meter(cents) {
  const clamped = cents == null ? null : Math.max(-100, Math.min(100, cents));
  return h('div', { class: 'meter', 'aria-hidden': 'true' },
    h('div', { class: 'track' }),
    h('div', { class: 'tick' }),
    clamped == null ? null : h('div', { class: 'needle', style: { left: `${50 + clamped / 2}%` } }),
    h('div', { class: 'labels' }, h('span', null, '−100¢ tighten'), h('span', null, 'target'), h('span', null, 'loosen +100¢')));
}

function lugsPanel(drum, session, actions) {
  const head = state.ui.head;
  const ref = lugReference(drum, head);
  const readings = readingsFor(drum)[head];
  const vals = readings.filter((v) => v > 0);
  const cents = vals.length && ref.hz ? vals.map((v) => centsBetween(v, ref.hz)) : [];
  const spread = vals.length > 1 ? centsBetween(Math.max(...vals), Math.min(...vals)) : null;
  const avg = vals.length ? Math.exp(vals.reduce((a, v) => a + Math.log(v), 0) / vals.length) : null;
  const done = vals.length === drum.lugs && cents.every((c) => Math.abs(c) <= IN_TUNE_CENTS);

  return h('div', null,
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('div', { class: 'grow' }, seg([['batter', 'Batter (top)'], ['reso', 'Reso (bottom)']], head, (v) => actions.setUi({ head: v })))),
    h('div', { class: 'card' },
      h('div', { class: 'target-line' },
        h('span', { class: 'muted small' }, ref.label),
        ref.hz ? h('b', { class: 'num' }, `${formatHz(ref.hz)} Hz · ${formatNote(ref.hz)}`) : h('span', { class: 'muted small' }, 'hit 2+ lugs')),
      drumHead(drum, head, session, actions.selectLug),
      h('p', { class: 'muted small', style: { textAlign: 'center' } },
        head === 'reso'
          ? 'Mute the batter head (lay a towel on it or flip the drum). '
          : drum.type === 'snare' ? 'Snares off. ' : 'Mute the reso head (rest it on a towel). ',
        `Tap lightly ~1″ in from lug ${(session.selectedLug % drum.lugs) + 1}. It moves to the next lug in star order automatically.`),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Lugs'), h('div', { class: 'v num' }, `${vals.length}/${drum.lugs}`)),
        h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Spread'), h('div', { class: 'v num' }, spread == null ? '—' : `${Math.round(spread)}¢`)),
        h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Average'), h('div', { class: 'v num' }, avg ? `${formatHz(avg)} Hz` : '—'))),
      done ? h('div', { class: 'hint info' }, '✓ Every lug is in tune on this head.') : null,
      h('div', { class: 'row wrap', style: { marginTop: '12px' } },
        h('div', { class: 'grow' }, seg([['target', 'Match target'], ['even', 'Even out']], state.ui.lugRef, (v) => actions.setUi({ lugRef: v }))),
        h('button', { class: 'btn small', onclick: () => actions.playLugRef(ref.hz), disabled: !ref.hz, 'aria-label': 'Play lug reference tap' }, icons.play(), 'Lug'),
        h('button', { class: 'btn small danger', onclick: actions.clearHead }, 'Clear'))));
}

function relationCard(drum, actions) {
  const r = readingsFor(drum);
  const avg = (arr) => {
    const v = arr.filter((x) => x > 0);
    return v.length ? Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length) : null;
  };
  const b = avg(r.batter);
  const rr = avg(r.reso);
  const t = lugTargets(drum);
  const est = estimateFundamental(drum, b, rr);
  const rel = b && rr ? (rr >= b ? describeInterval(rr, b) : describeInterval(b, rr)) : null;
  const targetRel = t.reso >= t.batter ? describeInterval(t.reso, t.batter) : describeInterval(t.batter, t.reso);
  return h('div', { class: 'card' },
    h('h2', null, 'Batter ↔ Reso relationship'),
    h('div', { class: 'grid2 num' },
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Batter lugs'), h('div', { class: 'v' }, b ? `${formatHz(b)} Hz` : '—'),
        h('div', { class: 'small muted' }, `target ${formatHz(t.batter)}`)),
      h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Reso lugs'), h('div', { class: 'v' }, rr ? `${formatHz(rr)} Hz` : '—'),
        h('div', { class: 'small muted' }, `target ${formatHz(t.reso)}`))),
    h('p', { class: 'small' },
      rel
        ? `${rr >= b ? 'Reso is higher' : 'Batter is higher'} by ${rel.name}${rel.cents ? ` ${rel.cents > 0 ? '+' : ''}${rel.cents}¢` : ''} (ratio ${(Math.max(b, rr) / Math.min(b, rr)).toFixed(2)}). `
        : 'Tune both heads in Lugs mode to see how they relate. ',
      h('span', { class: 'muted' }, `Target: ${drum.resonance === 'max' ? 'both heads equal' : `${drum.higherHead === 'batter' ? 'batter' : 'reso'} higher by ${targetRel.name}`} (${RESONANCE[drum.resonance].label} resonance).`)),
    est ? h('p', { class: 'small muted' }, `From your lug pitches, this drum should sound around ${formatHz(est)} Hz (${formatNote(est)}).`) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: actions.playMine, disabled: !(r.center || est) }, icons.play(), 'My drum now'),
      h('button', { class: 'btn small', onclick: actions.playTarget }, icons.play(), 'Target')));
}

function pitchPanel(drum, session, actions) {
  const r = readingsFor(drum);
  const f = r.center;
  const cents = f ? centsBetween(f, drum.fundamental) : null;
  const v = verdict(cents, { whole: true });
  const last = session.lastResult;
  const ratio = last && last.f1 && last.f0 ? last.f1 / last.f0 : null;
  return h('div', null,
    h('div', { class: 'card' },
      h('div', { class: 'target-line' },
        h('span', { class: 'muted small' }, 'Target fundamental'),
        h('b', { class: 'num' }, `${formatHz(drum.fundamental)} Hz · ${formatNote(drum.fundamental)}`)),
      h('div', { class: 'readout num' },
        h('div', null, h('span', { class: 'big' }, f ? formatHz(f) : '—'), h('span', { class: 'unit' }, 'Hz')),
        h('div', { class: 'note' }, f ? formatNote(f) : 'Hit the center of the drum'),
        v ? h('div', { class: `verdict ${v.cls}` }, `${fmtCents(cents)} · ${v.text}`) : null),
      meter(cents),
      session.history.length
        ? h('div', { class: 'history num' }, session.history.slice(-6).map((x) => h('span', null, formatHz(x))))
        : null,
      ratio
        ? h('p', { class: 'small muted', style: { textAlign: 'center' } },
          `Overtone F1 ${formatHz(last.f1)} Hz · F1/F0 = ${ratio.toFixed(2)}`)
        : null,
      h('p', { class: 'muted small', style: { textAlign: 'center' } },
        drum.type === 'kick'
          ? 'Kick: put the phone inside the port or right at the batter; iPhone mics struggle below ~45 Hz.'
          : 'Drum on its stand, both heads free. Hold the phone 5–10 cm above the head and hit the center at medium strength.')),
    relationCard(drum, actions));
}

function spectrumPanel(drum, session) {
  const canvas = h('canvas', { class: 'spectrum', 'aria-label': 'Spectrum of the last hit' });
  requestAnimationFrame(() => drawSpectrum(canvas, drum, session.lastResult));
  const last = session.lastResult;
  return h('div', { class: 'card' },
    h('h2', null, 'Spectrum of last hit'),
    canvas,
    last
      ? h('p', { class: 'small' },
        `F0 ${formatHz(last.f0)} Hz (${formatNote(last.f0)})`,
        last.f1 ? ` · F1 ${formatHz(last.f1)} Hz · ratio ${(last.f1 / last.f0).toFixed(2)}` : '',
        h('br'),
        h('span', { class: 'muted' }, 'Peaks: ', last.peaks.slice(0, 8).map((p) => formatHz(p.freq)).join(', '), ' Hz'))
      : h('p', { class: 'muted small' }, 'Hit the drum to see its fundamental (F0), overtones and your targets (amber lines).'),
    h('p', { class: 'muted small' }, 'Useful for spotting a strong overtone to muffle, or where to cut with EQ.'));
}

export function drawSpectrum(canvas, drum, result) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (!w) return;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const fmin = 30;
  const fmax = 1600;
  const x = (f) => (Math.log(f / fmin) / Math.log(fmax / fmin)) * w;
  g.fillStyle = '#121419';
  g.fillRect(0, 0, w, hgt);
  g.font = '10px -apple-system, sans-serif';
  g.fillStyle = '#6b7280';
  g.strokeStyle = '#23262e';
  for (const f of [50, 100, 200, 400, 800, 1600]) {
    g.beginPath();
    g.moveTo(x(f), 0);
    g.lineTo(x(f), hgt);
    g.stroke();
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x(f) + 3, hgt - 4);
  }
  const t = lugTargets(drum);
  const marks = [
    [drum.fundamental, 'F0 target', [4, 0]],
    [t.batter, 'batter lug', [4, 4]],
    [t.reso, 'reso lug', [2, 4]],
  ];
  g.strokeStyle = 'rgba(255,176,32,0.7)';
  g.fillStyle = 'rgba(255,176,32,0.9)';
  marks.forEach(([f, label, dash], i) => {
    g.setLineDash(dash[1] ? dash : []);
    g.beginPath();
    g.moveTo(x(f), 0);
    g.lineTo(x(f), hgt);
    g.stroke();
    g.fillText(label, x(f) + 3, 12 + i * 12);
  });
  g.setLineDash([]);
  if (!result) return;
  const { db, binHz, maxDb } = result.spectrum;
  const top = maxDb + 3;
  const range = 60;
  const y = (v) => ((top - v) / range) * (hgt - 16);
  g.beginPath();
  let started = false;
  for (let px = 0; px < w; px++) {
    const f = fmin * Math.pow(fmax / fmin, px / w);
    const f2 = fmin * Math.pow(fmax / fmin, (px + 1) / w);
    let v = -Infinity;
    for (let b = Math.floor(f / binHz); b <= Math.ceil(f2 / binHz) && b < db.length; b++) v = Math.max(v, db[b]);
    const yy = Math.min(hgt - 16, y(v));
    if (!started) {
      g.moveTo(px, yy);
      started = true;
    } else g.lineTo(px, yy);
  }
  g.lineTo(w, hgt);
  g.lineTo(0, hgt);
  g.closePath();
  g.fillStyle = 'rgba(61,220,132,0.18)';
  g.fill();
  g.strokeStyle = '#3ddc84';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#eef0f4';
  g.font = '600 11px -apple-system, sans-serif';
  // Label the strongest peaks, skipping any that would overlap a louder one.
  const f0Peak = result.peaks.reduce((a, b) => (Math.abs(b.freq - result.f0) < Math.abs(a.freq - result.f0) ? b : a));
  const placed = [];
  for (const p of result.peaks.slice().sort((a, b) => b.db - a.db).slice(0, 6)) {
    if (p.freq < fmin || p.freq > fmax) continue;
    const px = x(p.freq);
    if (placed.some((q) => Math.abs(q - px) < 34)) continue;
    placed.push(px);
    const label = p === f0Peak ? `F0 ${formatHz(result.f0)}` : formatHz(p.freq);
    g.fillText(label, Math.min(w - 44, px + 2), Math.max(24, y(p.db) - 4));
  }
}

export function renderTune(session, actions) {
  const drum = currentDrum();
  const mode = state.ui.mode;
  const wrap = h('div', null,
    h('div', { class: 'row between' },
      h('h1', null, 'Tune'),
      h('span', { class: 'pill' }, `${drumLabel(drum)} · ${drum.lugs} lugs`)),
    h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Drum' },
      state.kit.drums.map((d) =>
        h('button', {
          class: `chip${d.id === drum.id ? ' active' : ''}`,
          onclick: () => actions.selectDrum(d.id),
        }, d.name, h('small', null, `${d.diameter}″`)))),
    h('div', { style: { marginTop: '8px' } },
      seg([['lugs', 'Lugs'], ['pitch', 'Pitch'], ['spectrum', 'Spectrum']], mode, (v) => actions.setUi({ mode: v }))),
    session.error ? h('div', { class: 'hint' }, session.error) : null,
    !session.listening && !session.error
      ? h('div', { class: 'hint info' }, 'Tap ', h('b', null, 'Listen'), ' and allow the microphone. Work in a quiet room.')
      : null,
    mode === 'lugs' ? lugsPanel(drum, session, actions) : mode === 'pitch' ? pitchPanel(drum, session, actions) : spectrumPanel(drum, session),
    drum.type === 'kick' && mode === 'lugs'
      ? h('p', { class: 'muted small' }, 'Kick lug pitches are low; if readings jump around, turn on Focus in Kit → Settings and tap a bit harder.')
      : null);
  return wrap;
}

export function renderDock(session, actions) {
  const drum = currentDrum();
  const listen = h('button', { class: `listen${session.listening ? ' on' : ''}`, onclick: actions.toggleListen, 'aria-pressed': session.listening ? 'true' : 'false' },
    h('span', { class: 'dot' }),
    session.listening ? 'Listening…' : 'Listen',
    h('span', { class: 'level', id: 'level' }));
  return h('div', { class: 'dock' },
    h('div', { class: 'dock-inner' },
      listen,
      h('button', { class: 'btn icon-btn', onclick: actions.playTarget, 'aria-label': `Play target sound for ${drum.name}`, title: 'Play target sound' }, icons.play()),
      h('button', { class: `btn icon-btn${session.tone ? ' on' : ''}`, onclick: actions.toggleTone, 'aria-label': 'Reference tone', 'aria-pressed': session.tone ? 'true' : 'false', title: 'Reference tone' }, icons.wave())));
}
