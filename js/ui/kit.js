// Kit tab: drums, target sound designer, kit intervals, saved tunings, settings.

import { h, seg, icons, openSheet, toast } from './dom.js';
import {
  state, commit, readingsFor, addDrum, removeDrum, saveTuning, loadTuning, deleteTuning,
  exportData, importData, resetAll, clearReadings,
} from '../store.js';
import {
  RESONANCE, DRUM_TYPES, STYLES, KIT_PATTERNS, lugTargets, suggestFundamental, kitIntervals,
  makeDrum, drumLabel, estimateFundamental,
} from '../tuning/model.js';
import { formatHz, formatNote, freqToMidi, midiToFreq, midiToName, describeInterval } from '../dsp/notes.js';

export function drumSoundParams(d, fundamental = d.fundamental) {
  return { fundamental, type: d.type, diameter: d.diameter, resonance: d.resonance, higherHead: d.higherHead };
}

function toms() {
  return state.kit.drums.filter((d) => d.type === 'tom' || d.type === 'floor');
}

/** A short groove + fill across the kit, to hear the whole tuning together. */
export function kitGroove(drums = state.kit.drums) {
  const kick = drums.find((d) => d.type === 'kick');
  const snare = drums.find((d) => d.type === 'snare');
  const tomsHighToLow = drums.filter((d) => d.type === 'tom' || d.type === 'floor').sort((a, b) => b.fundamental - a.fundamental);
  const beat = 60 / 100 / 2; // eighth notes at 100 bpm
  const ev = [];
  const add = (d, at, velocity = 0.9) => d && ev.push({ at, params: { ...drumSoundParams(d), velocity } });
  add(kick, 0);
  add(snare, beat * 2);
  add(kick, beat * 3, 0.7);
  add(kick, beat * 4);
  add(snare, beat * 6);
  // Fill: two hits per tom, high to low, ending on kick.
  let t = beat * 8;
  const sixteenth = beat / 2;
  for (const d of tomsHighToLow) {
    add(d, t, 0.9);
    add(d, t + sixteenth, 0.75);
    t += sixteenth * 2;
  }
  add(kick, t + sixteenth, 1);
  return ev;
}

function drumCard(d, actions) {
  const t = lugTargets(d);
  const r = readingsFor(d);
  const est = r.center || estimateFundamental(d, avgOf(r.batter), avgOf(r.reso));
  return h('div', { class: 'card drum-card' },
    h('div', { class: 'drum-icon' }, `${d.diameter}″`),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, d.name),
      h('div', { class: 'sub' }, `${drumLabel(d)} · ${d.lugs} lugs`, d.notes ? ` · ${d.notes}` : ''),
      h('div', { class: 'sub num' },
        h('b', { style: { color: 'var(--text)' } }, `${formatNote(d.fundamental)} · ${formatHz(d.fundamental)} Hz`),
        ` · batter ${formatHz(t.batter)} · reso ${formatHz(t.reso)} Hz`),
      est ? h('div', { class: 'sub num' }, `Measured ≈ ${formatHz(est)} Hz`) : null),
    h('div', { class: 'row' },
      h('button', { class: 'btn icon-btn', onclick: () => actions.play(drumSoundParams(d)), 'aria-label': `Play ${d.name} target` }, icons.play()),
      h('button', { class: 'btn small', onclick: () => openDrumEditor(d, actions) }, 'Edit')));
}

function avgOf(arr) {
  const v = arr.filter((x) => x > 0);
  return v.length ? Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length) : null;
}

export function openDrumEditor(drum, actions, { isNew = false } = {}) {
  const d = drum;
  openSheet(isNew ? 'New drum' : d.name, (close, rerender) => {
    const update = (patch, { rerenderSheet = true } = {}) => {
      Object.assign(d, patch);
      commit();
      if (rerenderSheet) rerender();
    };
    const t = lugTargets(d);
    const midi = freqToMidi(d.fundamental);
    const nearest = Math.round(midi);
    const fineCents = Math.round((midi - nearest) * 100);
    const r = readingsFor(d);
    const measured = r.center || estimateFundamental(d, avgOf(r.batter), avgOf(r.reso));
    const lugRel = t.reso >= t.batter ? describeInterval(t.reso, t.batter) : describeInterval(t.batter, t.reso);

    const num = (label, key, { min, max, step = 1 }) =>
      h('label', { class: 'field' }, h('span', null, label),
        h('input', {
          type: 'number', inputmode: 'decimal', min, max, step, value: d[key],
          onchange: (e) => {
            const v = parseFloat(e.target.value);
            if (v >= min && v <= max) update({ [key]: key === 'lugs' ? Math.round(v) : v });
            else rerender();
          },
        }));

    return h('div', null,
      h('label', { class: 'field' }, h('span', null, 'Name'),
        h('input', { type: 'text', value: d.name, onchange: (e) => update({ name: e.target.value.trim() || d.name }, { rerenderSheet: false }) })),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', null, 'Type'),
          h('select', { onchange: (e) => update({ type: e.target.value }) },
            Object.entries(DRUM_TYPES).map(([k, v]) => h('option', { value: k, selected: d.type === k }, v)))),
        num('Lugs per head', 'lugs', { min: 3, max: 16 })),
      h('div', { class: 'grid2' },
        num('Diameter (in)', 'diameter', { min: 6, max: 28, step: 0.5 }),
        num('Depth (in)', 'depth', { min: 2, max: 24, step: 0.25 })),
      h('label', { class: 'field' }, h('span', null, 'Notes (heads, muffling…)'),
        h('input', { type: 'text', value: d.notes || '', onchange: (e) => update({ notes: e.target.value }, { rerenderSheet: false }) })),

      h('div', { class: 'card' },
        h('h2', null, 'Target sound'),
        h('p', { class: 'muted small' }, 'Pick a starting point, listen, and adjust until it sounds right. Then tune the real drum to match.'),
        h('div', { class: 'grid3' },
          Object.entries(STYLES).map(([k, st]) => {
            const f = suggestFundamental(d.type, d.diameter, k);
            return h('button', {
              class: 'btn small', style: { flexDirection: 'column', gap: '0' },
              onclick: () => { update({ fundamental: f }); actions.play(drumSoundParams(d)); },
            }, h('span', null, st.label), h('span', { class: 'muted small num' }, `${midiToName(Math.round(freqToMidi(f)))}`));
          })),
        h('h3', null, 'Fundamental (whole drum, hit in the center)'),
        h('div', { class: 'stepper' },
          h('button', { class: 'btn icon-btn', 'aria-label': 'Down a semitone', onclick: () => update({ fundamental: midiToFreq(nearest - 1) }) }, '−'),
          h('div', { class: 'val num' }, h('b', null, formatNote(d.fundamental)), h('span', { class: 'muted' }, `${formatHz(d.fundamental)} Hz`)),
          h('button', { class: 'btn icon-btn', 'aria-label': 'Up a semitone', onclick: () => update({ fundamental: midiToFreq(nearest + 1) }) }, '+')),
        h('label', { class: 'field' }, h('span', null, `Fine tune: ${fineCents > 0 ? '+' : ''}${fineCents}¢`),
          h('input', {
            type: 'range', min: -50, max: 50, step: 1, value: fineCents,
            oninput: (e) => update({ fundamental: midiToFreq(nearest + parseInt(e.target.value, 10) / 100) }, { rerenderSheet: false }),
            onchange: () => rerender(),
          })),
        measured
          ? h('button', { class: 'btn small', onclick: () => { update({ fundamental: measured }); toast('Target set from your drum'); } },
            `Use my drum's current pitch (${formatHz(measured)} Hz)`)
          : null,

        h('h3', null, 'Resonance (sustain)'),
        seg(Object.entries(RESONANCE).map(([k, v]) => [k, v.label]), d.resonance, (v) => update({ resonance: v })),
        h('p', { class: 'muted small' }, RESONANCE[d.resonance].blurb),
        h('h3', null, 'Which head is higher?'),
        seg([['reso', 'Reso higher'], ['batter', 'Batter higher']], d.higherHead, (v) => update({ higherHead: v }),
          { disabled: () => d.resonance === 'max' }),
        h('p', { class: 'muted small' },
          d.resonance === 'max' ? 'Both heads are equal at Maximum resonance.'
            : d.higherHead === 'reso' ? 'Reso higher: controlled, focused, slight pitch drop. The usual choice.'
              : 'Batter higher: more attack and stick definition.'),

        h('div', { class: 'grid2', style: { marginTop: '10px' } },
          h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Batter lugs'), h('div', { class: 'v num' }, `${formatHz(t.batter)} Hz`), h('div', { class: 'small muted' }, formatNote(t.batter))),
          h('div', { class: 'stat' }, h('div', { class: 'k' }, d.type === 'snare' ? 'Snare-side lugs' : 'Reso lugs'), h('div', { class: 'v num' }, `${formatHz(t.reso)} Hz`), h('div', { class: 'small muted' }, formatNote(t.reso)))),
        d.resonance !== 'max' ? h('p', { class: 'muted small' }, `Heads ${lugRel.name} apart.`) : null,
        h('div', { class: 'row wrap', style: { marginTop: '10px' } },
          h('button', { class: 'btn primary', onclick: () => actions.play(drumSoundParams(d)) }, icons.play(), 'Play target'),
          measured ? h('button', { class: 'btn', onclick: () => actions.play(drumSoundParams(d, measured)) }, icons.play(), 'My drum now') : null,
          h('button', { class: 'btn', onclick: () => actions.play({ ...drumSoundParams(d), strike: 'edge' }) }, icons.play(), 'Rim-side hit'))),

      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => { close(); actions.tuneDrum(d.id); } }, 'Tune this drum'),
        h('button', { class: 'btn', onclick: () => { clearReadings(d); commit(); rerender(); toast('Readings cleared'); } }, 'Clear readings'),
        h('button', {
          class: 'btn danger',
          onclick: () => {
            if (state.kit.drums.length <= 1) return toast('A kit needs at least one drum');
            if (confirm(`Delete ${d.name}?`)) { removeDrum(d.id); commit(); close(); }
          },
        }, 'Delete')));
  });
}

function kitDesigner(actions) {
  const list = toms();
  if (list.length < 2) return null;
  const ui = state.ui;
  const pattern = ui.kitPattern || 'fourths';
  const lowest = list.slice().sort((a, b) => b.diameter - a.diameter)[0];
  const lowMidi = ui.kitLowMidi ?? Math.round(freqToMidi(lowest.fundamental));
  const preview = kitIntervals(list, midiToFreq(lowMidi), pattern);
  const set = (patch) => { Object.assign(state.ui, patch); commit(); };
  const previewDrums = state.kit.drums.map((d) => (preview.has(d.id) ? { ...d, fundamental: preview.get(d.id) } : d));

  return h('div', { class: 'card' },
    h('h2', null, 'Tom intervals'),
    h('p', { class: 'muted small' }, 'Tune your toms as a musical set. Choose the spacing and the floor tom’s note; the rest follow.'),
    h('label', { class: 'field' }, h('span', null, 'Spacing'),
      h('select', { onchange: (e) => set({ kitPattern: e.target.value }) },
        Object.entries(KIT_PATTERNS).map(([k, p]) => h('option', { value: k, selected: k === pattern }, `${p.label} · ${p.blurb}`)))),
    h('div', { class: 'stepper' },
      h('button', { class: 'btn icon-btn', 'aria-label': 'Lower', onclick: () => set({ kitLowMidi: lowMidi - 1 }) }, '−'),
      h('div', { class: 'val' }, h('b', null, midiToName(lowMidi)), h('span', { class: 'muted small' }, `${lowest.name} (lowest tom)`)),
      h('button', { class: 'btn icon-btn', 'aria-label': 'Higher', onclick: () => set({ kitLowMidi: lowMidi + 1 }) }, '+')),
    h('table', { class: 'chart num', style: { marginTop: '8px' } },
      h('tr', null, h('th', null, 'Drum'), h('th', null, 'Now'), h('th', null, 'New')),
      list.slice().sort((a, b) => preview.get(b.id) - preview.get(a.id)).map((d) =>
        h('tr', null, h('td', null, d.name), h('td', { class: 'muted' }, formatNote(d.fundamental)),
          h('td', null, h('b', null, `${midiToName(Math.round(freqToMidi(preview.get(d.id))))}`), ` ${formatHz(preview.get(d.id))} Hz`)))),
    h('div', { class: 'row wrap', style: { marginTop: '10px' } },
      h('button', { class: 'btn', onclick: () => actions.playSequence(kitGroove(previewDrums)) }, icons.play(), 'Preview'),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          for (const d of list) d.fundamental = preview.get(d.id);
          commit();
          toast('Tom targets updated');
        },
      }, 'Apply to toms')));
}

function tuningsCard() {
  const input = h('input', { type: 'text', placeholder: 'e.g. Rock gig, Jazz trio', 'aria-label': 'Tuning name' });
  return h('div', { class: 'card' },
    h('h2', null, 'Saved tunings'),
    h('p', { class: 'muted small' }, 'Snapshot every drum’s target so you can switch between sounds.'),
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, input),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const name = input.value.trim() || `Tuning ${state.tunings.length + 1}`;
          saveTuning(name);
          commit();
          toast(`Saved “${name}”`);
        },
      }, 'Save')),
    state.tunings.length
      ? h('div', { style: { marginTop: '8px' } },
        state.tunings.map((t) =>
          h('div', { class: 'row', style: { padding: '8px 0', borderTop: '1px solid var(--line)' } },
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, t.name),
              h('div', { class: 'muted small num' },
                t.drums.map((sd) => {
                  const d = state.kit.drums.find((x) => x.id === sd.id);
                  return d ? `${d.diameter}″ ${formatNote(sd.fundamental).split(' ')[0]}` : null;
                }).filter(Boolean).join(' · '))),
            h('button', { class: 'btn small', onclick: () => { loadTuning(t.id); commit(); toast(`Loaded “${t.name}”`); } }, 'Load'),
            h('button', { class: 'btn small danger', 'aria-label': `Delete ${t.name}`, onclick: () => { if (confirm(`Delete “${t.name}”?`)) { deleteTuning(t.id); commit(); } } }, '✕'))))
      : null);
}

function settingsCard(actions) {
  const st = state.settings;
  const set = (patch) => { Object.assign(st, patch); commit(); actions.settingsChanged(); };
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', style: { display: 'none' },
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        importData(await f.text());
        commit();
        toast('Kit imported');
      } catch (err) {
        toast(err.message || 'Import failed');
      }
    },
  });
  return h('div', { class: 'card' },
    h('h2', null, 'Settings'),
    h('label', { class: 'field' }, h('span', null, `Hit sensitivity: ${Math.round(st.sensitivity * 100)}%`),
      h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.sensitivity, onchange: (e) => set({ sensitivity: parseFloat(e.target.value) }) })),
    h('p', { class: 'muted small' }, 'Lower it if noise or other drums trigger readings; raise it for soft lug taps.'),
    h('label', { class: 'switch' },
      h('span', null, h('b', null, 'Focus filter'), h('br'), h('span', { class: 'muted small' }, 'In lug mode, ignore overtones far from the expected lug pitch.')),
      h('input', { type: 'checkbox', checked: st.focus, onchange: (e) => set({ focus: e.target.checked }) })),
    h('label', { class: 'switch' },
      h('span', null, h('b', null, 'Keep screen awake'), h('br'), h('span', { class: 'muted small' }, 'While listening.')),
      h('input', { type: 'checkbox', checked: st.wakeLock, onchange: (e) => set({ wakeLock: e.target.checked }) })),
    h('h3', null, 'Backup & share'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn small', onclick: () => shareExport() }, 'Export kit'),
      h('button', { class: 'btn small', onclick: () => fileInput.click() }, 'Import kit'),
      h('button', {
        class: 'btn small danger',
        onclick: () => { if (confirm('Reset everything to the default kit? Saved tunings will be lost.')) { resetAll(); commit(); toast('Reset'); } },
      }, 'Reset'),
      fileInput));
}

async function shareExport() {
  const text = exportData();
  const name = `${state.kit.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'kit'}-tuning.json`;
  const file = typeof File !== 'undefined' ? new File([text], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Drum tuning' });
      return;
    } catch {
      /* cancelled: fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function renderKit(actions) {
  return h('div', null,
    h('div', { class: 'row between' },
      h('h1', null, 'Kit'),
      h('button', { class: 'btn small primary', onclick: () => actions.playSequence(kitGroove()) }, icons.play(), 'Play kit')),
    h('label', { class: 'field' }, h('span', null, 'Kit name'),
      h('input', { type: 'text', value: state.kit.name, onchange: (e) => { state.kit.name = e.target.value; commit(); } })),
    state.kit.drums.map((d) => drumCard(d, actions)),
    h('button', {
      class: 'btn', style: { width: '100%' },
      onclick: () => {
        const d = makeDrum({ name: 'New tom', type: 'tom', diameter: 13, depth: 9, lugs: 6 });
        addDrum(d);
        commit();
        openDrumEditor(d, actions, { isNew: true });
      },
    }, '+ Add drum'),
    kitDesigner(actions),
    tuningsCard(),
    settingsCard(actions));
}
