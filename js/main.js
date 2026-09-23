// App entry: routing, listening, hit handling.

import { state, commit, subscribe, currentDrum, readingsFor, clearReadings } from './store.js';
import { AudioEngine } from './audio/engine.js';
import { HitDetector, analyzeHit } from './dsp/pitch.js';
import { detectRange, starOrder, lugTargets, estimateFundamental } from './tuning/model.js';
import { renderTune, renderDock, drawSpectrum, lugReference } from './ui/tune.js';
import { renderKit, drumSoundParams } from './ui/kit.js';
import { renderLearn } from './ui/learn.js';
import { toast } from './ui/dom.js';

const engine = new AudioEngine();
const session = {
  listening: false,
  selectedLug: 0,
  lastResult: null,
  history: [],
  tone: false,
  error: null,
};
let detector = null;
let wakeLock = null;

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

// ---------- rendering ----------

function render() {
  const tab = state.ui.tab;
  tabbar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const scrollY = window.scrollY;
  let content;
  if (tab === 'kit') content = renderKit(kitActions);
  else if (tab === 'learn') content = renderLearn();
  else content = [renderTune(session, tuneActions), renderDock(session, tuneActions)];
  view.classList.toggle('no-dock', tab !== 'tune');
  view.replaceChildren(...[content].flat());
  window.scrollTo(0, scrollY);
}

subscribe(render);

tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  state.ui.tab = b.dataset.tab;
  commit();
  window.scrollTo(0, 0);
});

// ---------- sound ----------

function play(params) {
  engine.playDrum(params).catch((err) => toast(err.message));
}

function avgLog(arr) {
  const v = arr.filter((x) => x > 0);
  return v.length ? Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length) : null;
}

function toneFrequency() {
  const drum = currentDrum();
  if (state.ui.mode === 'lugs') return lugReference(drum, state.ui.head).hz || lugTargets(drum)[state.ui.head];
  return drum.fundamental;
}

// ---------- listening ----------

function analysisOptions() {
  const drum = currentDrum();
  const mode = state.ui.mode === 'lugs' ? 'lug' : 'center';
  const [fmin, fmax] = detectRange(drum.type, mode);
  const opts = { mode, fmin, fmax };
  if (mode === 'lug') {
    opts.windowMs = 220;
    if (state.settings.focus) {
      const ref = lugReference(drum, state.ui.head).hz;
      opts.focusHz = ref || lugTargets(drum)[state.ui.head];
    }
  } else {
    opts.windowMs = drum.type === 'kick' ? 400 : 320;
  }
  return opts;
}

function onHit(samples) {
  const result = analyzeHit(samples, engine.sampleRate, analysisOptions());
  if (!result || result.confidence < 0.1) return;
  const drum = currentDrum();
  const r = readingsFor(drum);
  session.lastResult = result;
  if (state.ui.mode === 'lugs') {
    const n = drum.lugs;
    const lug = session.selectedLug % n;
    r[state.ui.head][lug] = result.freq;
    // Advance to the next lug in star order.
    const order = starOrder(n);
    session.selectedLug = order[(order.indexOf(lug) + 1) % n];
  } else {
    r.center = result.f0;
    r.f1 = result.f1;
    session.history.push(result.f0);
    if (session.history.length > 20) session.history.shift();
  }
  r.at = Date.now();
  if (navigator.vibrate) navigator.vibrate(15);
  commit();
}

let levelEl = null;
let lastLevelPaint = 0;
function onLevel(db) {
  const now = performance.now();
  if (now - lastLevelPaint < 50) return;
  lastLevelPaint = now;
  if (!levelEl || !levelEl.isConnected) levelEl = document.getElementById('level');
  if (levelEl) levelEl.style.width = `${Math.max(0, Math.min(100, ((db + 70) / 60) * 100))}%`;
}

async function requestWakeLock() {
  if (!state.settings.wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* denied or unsupported */
  }
}

async function startListening() {
  session.error = null;
  try {
    await engine.startMic((block) => detector && detector.push(block));
    detector = new HitDetector(engine.sampleRate, { sensitivity: state.settings.sensitivity, onHit, onLevel });
    session.listening = true;
    requestWakeLock();
  } catch (err) {
    session.error =
      err && err.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in Settings → Apps → Safari → Microphone, then reload.'
        : `Could not start the microphone: ${err.message || err}`;
    session.listening = false;
  }
  render();
}

function stopListening() {
  engine.stopMic();
  detector = null;
  session.listening = false;
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && session.listening) stopListening();
});

// ---------- actions ----------

const tuneActions = {
  setUi(patch) {
    if (patch.head) session.lastResult = null;
    Object.assign(state.ui, patch);
    if (session.tone) engine.setTone(toneFrequency());
    commit();
  },
  selectDrum(id) {
    state.ui.drumId = id;
    session.selectedLug = 0;
    session.lastResult = null;
    session.history = [];
    if (session.tone) engine.setTone(toneFrequency());
    commit();
  },
  selectLug(i) {
    session.selectedLug = i;
    render();
  },
  toggleListen() {
    if (session.listening) stopListening();
    else startListening();
  },
  playTarget() {
    play(drumSoundParams(currentDrum()));
  },
  playMine() {
    const drum = currentDrum();
    const r = readingsFor(drum);
    const f = r.center || estimateFundamental(drum, avgLog(r.batter), avgLog(r.reso));
    if (f) play(drumSoundParams(drum, f));
  },
  playLugRef(hz) {
    if (hz) engine.playLugTap(hz).catch((err) => toast(err.message));
  },
  async toggleTone() {
    session.tone = !session.tone;
    await engine.setTone(session.tone ? toneFrequency() : 0);
    render();
  },
  clearHead() {
    const drum = currentDrum();
    if (state.ui.mode === 'lugs') clearReadings(drum, state.ui.head);
    session.selectedLug = 0;
    commit();
  },
};

const kitActions = {
  play,
  playSequence(events) {
    engine.playSequence(events).catch((err) => toast(err.message));
  },
  tuneDrum(id) {
    state.ui.tab = 'tune';
    tuneActions.selectDrum(id);
    window.scrollTo(0, 0);
  },
  settingsChanged() {
    if (detector) detector.setSensitivity(state.settings.sensitivity);
  },
};

// Redraw the spectrum canvas on rotation/resize.
window.addEventListener('resize', () => {
  const c = document.querySelector('canvas.spectrum');
  if (c) drawSpectrum(c, currentDrum(), session.lastResult);
});

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Test hook: lets automated tests inspect state without touching the UI.
window.__drumTuner = { state, session };
