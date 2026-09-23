// Learn tab: how to use the app + drum tuning fundamentals.

import { h } from './dom.js';
import { suggestFundamental, RESONANCE } from '../tuning/model.js';
import { formatHz, formatNote } from '../dsp/notes.js';

function section(title, body, open = false) {
  return h('details', { class: 'learn', open }, h('summary', null, title), h('div', null, body));
}

function chartTable() {
  const rows = [
    ['10″ tom', 'tom', 10], ['12″ tom', 'tom', 12], ['13″ tom', 'tom', 13], ['14″ floor', 'floor', 14],
    ['16″ floor', 'floor', 16], ['14″ snare', 'snare', 14], ['20″ kick', 'kick', 20], ['22″ kick', 'kick', 22],
  ];
  return h('table', { class: 'chart num' },
    h('tr', null, h('th', null, 'Drum'), h('th', null, 'Low'), h('th', null, 'Medium'), h('th', null, 'High')),
    rows.map(([label, type, dia]) =>
      h('tr', null, h('td', null, label),
        ['low', 'medium', 'high'].map((st) => {
          const f = suggestFundamental(type, dia, st);
          return h('td', null, formatNote(f), h('br'), h('span', { class: 'muted small' }, `${formatHz(f)} Hz`));
        }))));
}

export function renderLearn() {
  return h('div', null,
    h('h1', null, 'Learn'),
    section('Quick start', h('ol', null,
      h('li', null, h('b', null, 'Pick a target. '), 'In Kit, open a drum, try Low / Medium / High and press ▶ to hear it. Adjust the note and resonance until you like it.'),
      h('li', null, h('b', null, 'Seat the heads. '), 'Finger-tighten all rods, then press firmly on the center a few times to stretch the new head.'),
      h('li', null, h('b', null, 'Even the batter lugs. '), 'Tune → Lugs → Batter. Mute the bottom head (rest it on a towel). Tap lightly about 1″ in from each lug. Tighten blue lugs and loosen red ones until they all turn green.'),
      h('li', null, h('b', null, 'Even the reso lugs. '), 'Flip or mute the batter side and repeat on Reso.'),
      h('li', null, h('b', null, 'Check the whole drum. '), 'Tune → Pitch. Mount the drum, hit the center, and compare to the target. If it is off, move every lug on both heads by the same small amount.'),
      h('li', null, h('b', null, 'Listen. '), 'Press ▶ to compare the target sound with “My drum now”.')), true),

    section('How the numbers fit together', h('div', null,
      h('p', null, 'The ', h('b', null, 'fundamental'), ' is the lowest note you hear hitting the center of the assembled drum. The ', h('b', null, 'lug pitch'),
        ' is what one head produces when you tap near a lug with the other head muted. Lug pitch is always higher than the fundamental.'),
      h('p', null, 'This app uses the Tune-Bot method: each head’s lug pitch is a multiple of the fundamental, and how far apart the two heads are sets the sustain:'),
      h('table', { class: 'chart num' },
        h('tr', null, h('th', null, 'Resonance'), h('th', null, 'Higher head'), h('th', null, 'Lower head')),
        Object.values(RESONANCE).map((r) => h('tr', null, h('td', null, r.label), h('td', null, `${r.higher}×`), h('td', null, `${r.lower}×`)))),
      h('p', { class: 'muted small' }, 'Example: a 12″ tom at B2 (123 Hz) with Maximum resonance → both heads 216 Hz at the lugs.'))),

    section('Batter vs resonant head', h('ul', null,
      h('li', null, h('b', null, 'Equal: '), 'most sustain and the most open, singing tone.'),
      h('li', null, h('b', null, 'Reso higher: '), 'a controlled, focused tone with a slight pitch drop. The most common studio choice.'),
      h('li', null, h('b', null, 'Batter higher: '), 'more attack and articulation, less boom.'),
      h('li', null, h('b', null, 'Big gap: '), 'shorter notes and a stronger downward “bwow” pitch bend.'),
      h('li', null, h('b', null, 'Snare: '), 'the snare-side head is usually much higher than the batter. Tune with snares off, then set the strainer.'))),

    section('Starting pitches by drum size', h('div', null,
      chartTable(),
      h('p', { class: 'muted small' }, 'These are starting points. Every shell, head and room is different, so trust your ears and adjust the target.'))),

    section('Tuning toms as a set', h('div', null,
      h('p', null, 'Toms sound best when they form a musical interval. Perfect 4ths are the classic rock spacing. Major 3rds sound smooth and melodic. A major or minor chord across three or four toms sounds great in fills.'),
      h('p', null, 'Kit → Tom intervals sets every tom from the floor tom’s note. Press Preview to hear a fill first.'))),

    section('Your gear', h('ul', null,
      h('li', null, h('b', null, 'Canopus Yaiba 14×6.5 aluminum snare: '), 'aluminum shells are bright, sensitive and ring a lot. Try the Medium or High presets first. If it rings too much, add a little muffling (a gel pad) before you detune.'),
      h('li', null, h('b', null, 'Pearl Export toms: '), 'recent Exports use poplar/Asian mahogany shells that resonate well. The Medium presets are a good start, and new heads benefit from a firm seating press.'),
      h('li', null, h('b', null, 'Your sizes: '), 'Export kits shipped with either 10/12/16 or 12/13/16 toms. Check the drum sizes in Kit and edit them if needed; targets update automatically.'))),

    section('Getting clean readings', h('ul', null,
      h('li', null, 'Work in a quiet room. Mute the other drums and the snare wires.'),
      h('li', null, 'Keep the iPhone 5–10 cm (2–4″) above the head with the bottom microphone facing the drum.'),
      h('li', null, 'For lugs, tap lightly with a stick about 1″ in from the rod. For pitch, hit the center at medium strength.'),
      h('li', null, 'If lug readings jump to an overtone, turn on Kit → Settings → Focus filter, or tap more lightly.'),
      h('li', null, 'Bass drums: iPhone mics lose accuracy below about 45 Hz. Tune kick lugs (they sit higher), and use pitch mode only as a guide.'))),

    section('Using the app on your iPhone', h('ul', null,
      h('li', null, 'In Safari, tap Share → ', h('b', null, 'Add to Home Screen'), '. It then opens full screen, like an app, and works offline.'),
      h('li', null, 'If the microphone is blocked: Settings → Apps → Safari → Microphone → Allow (or Ask).'),
      h('li', null, 'Demo sounds play even with the silent switch on (iOS 16.4+). Otherwise, turn the silent switch off.'),
      h('li', null, 'Your kit and saved tunings are stored on this device. Use Kit → Export to back them up.'))));
}
