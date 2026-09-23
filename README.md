# Drum Tuner

A precision drum tuner for iPhone, built as a web app (PWA) you add to your Home Screen. It is inspired by iDrumTune Pro, Drumtune PRO and the Tune-Bot tuning method.

## Features

- **Lug tuning:** tap near each lug and the app shows which lugs to tighten (blue) or loosen (red) until they turn green. It moves to the next lug in star (criss-cross) order automatically. You can match to your target or just even the lugs out.
- **Pitch mode:** hit the center of the drum to read its fundamental (Hz, note and cents) against your target, with a tuning meter and a record of recent hits.
- **Batter ↔ reso relationship:** shows the interval and ratio between the two heads and estimates the drum's pitch from your lug readings.
- **Spectrum analyzer:** shows the fundamental (F0), the first overtone (F1) and the other peaks of the last hit, with your targets overlaid.
- **Target sound designer:** pick Low / Medium / High starting pitches for each drum size, adjust the note and resonance, and **hear it**. A modal drum synthesizer plays the target and can play "my drum now" for comparison.
- **Tom intervals:** set the floor tom's note and a spacing (4ths, 3rds, chords); every tom follows, and you can preview a fill.
- **Saved tunings:** keep kit-wide snapshots (e.g. "Rock gig", "Jazz"), plus JSON export/import and share.
- **Extras:** reference tone generator, screen stays awake while listening, works offline.
- **Pre-loaded kit:** Pearl Export 5-piece (22″ kick, 10″/12″ rack toms, 16″ floor) with a Canopus Yaiba 14×6.5 aluminum snare. You can edit sizes and lug counts in the **Kit** tab.

## How the tuning math works

It uses the Overtone Labs (Tune-Bot) method. The pitch you hear tapping ~1″ in from a lug (other head muted) is a multiple of the assembled drum's fundamental. How far apart the two heads are sets the sustain:

| Resonance | Higher head | Lower head |
|-----------|-------------|------------|
| Maximum   | 1.75×       | 1.75×      |
| High      | 1.85×       | 1.5×       |
| Medium    | 2.0×        | 1.4×       |
| Low       | 2.3×        | 1.2×       |

Pitch detection takes a high-resolution FFT of the ringing part of each hit. Center hits use the lowest strong peak; lug taps use the strongest peak, with an optional focus filter near the expected lug pitch. The measurement is then taken again on the settled tail of the ring, so the brief pitch drop right after the stick hits doesn't skew it.

## Put it on your iPhone

The microphone only works over **https**, so the app needs to be hosted:

1. **GitHub Pages** (included): the workflow in `.github/workflows/pages.yml` runs the tests and deploys on every push. In the repo, go to **Settings → Pages** and set **Source = GitHub Actions**. The site will be at `https://<user>.github.io/drum-tuner/`. Note: Pages on a *private* repo needs a paid GitHub plan; otherwise make the repo public, or use the next option.
2. **Netlify Drop** (no account setup): drag the folder onto https://app.netlify.com/drop.

Then, on the iPhone: open the URL in **Safari → Share → Add to Home Screen**. Launch it from the icon and allow the microphone.

## Develop

```sh
npm install          # only needed for the browser end-to-end test (Playwright)
npm test             # DSP + tuning unit tests
npm run e2e          # drives Chromium with synthesized drum hits as a fake mic
npm run serve        # http://localhost:8080 (localhost counts as secure for the mic)
```

It is plain ES modules with no build step. Layout:

- `js/dsp/`: FFT, pitch analysis, hit detection, note math
- `js/audio/`: mic capture (AudioWorklet), playback, drum synthesizer
- `js/tuning/model.js`: ratios, presets, star pattern, intervals, default kit
- `js/ui/`: Tune, Kit and Learn screens
