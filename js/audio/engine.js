// Browser audio: microphone capture, sample playback and a reference tone.
//
// iOS Safari notes:
//  - An AudioContext may only start from a user gesture, so everything is
//    created lazily from tap handlers.
//  - Voice processing (echo cancellation, noise suppression, AGC) is turned
//    off; it would eat drum transients and pull pitches around.
//  - navigator.audioSession (Safari 16.4+) selects the audio category: we use
//    "playback" when not listening so demo sounds ignore the silent switch.

import { renderDrum, renderLugTap } from './drumsynth.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.onBlock = null;
    this.muteUntil = 0;
    this.tone = null;
    this.current = null;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  get listening() {
    return !!this.stream;
  }

  _setSession(type) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = type;
    } catch {
      /* not supported */
    }
  }

  async ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  async startMic(onBlock) {
    this.onBlock = onBlock;
    if (this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser cannot access the microphone. Open the app in Safari over https.');
    }
    this._setSession('play-and-record');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const ctx = await this.ensureContext();
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    const deliver = (block) => {
      if (this.onBlock && ctx.currentTime >= this.muteUntil) this.onBlock(block);
    };
    try {
      await ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(ctx, 'capture-processor', { numberOfInputs: 1, numberOfOutputs: 0 });
      this.node.port.onmessage = (e) => deliver(e.data);
      this.source.connect(this.node);
    } catch {
      // Older Safari: fall back to ScriptProcessor.
      const sp = ctx.createScriptProcessor(1024, 1, 1);
      sp.onaudioprocess = (e) => deliver(new Float32Array(e.inputBuffer.getChannelData(0)));
      const sink = ctx.createGain();
      sink.gain.value = 0;
      this.source.connect(sp);
      sp.connect(sink);
      sink.connect(ctx.destination);
      this.node = sp;
    }
  }

  stopMic() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.source) this.source.disconnect();
    if (this.node) this.node.disconnect();
    this.stream = this.source = this.node = null;
    this._setSession('playback');
  }

  /** Play a mono Float32Array. Detection is paused while it rings. */
  async playSamples(samples) {
    const ctx = await this.ensureContext();
    if (!this.listening) this._setSession('playback');
    this.stopSound();
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    this.current = src;
    this.muteUntil = ctx.currentTime + buf.duration + 0.25;
    return new Promise((resolve) => (src.onended = resolve));
  }

  stopSound() {
    if (this.current) {
      try {
        this.current.stop();
      } catch {
        /* already stopped */
      }
      this.current = null;
    }
  }

  async playDrum(params) {
    const ctx = await this.ensureContext();
    return this.playSamples(renderDrum({ ...params, sampleRate: ctx.sampleRate }));
  }

  async playLugTap(freq) {
    const ctx = await this.ensureContext();
    return this.playSamples(renderLugTap(freq, ctx.sampleRate));
  }

  /** Render a short sequence of drums into one buffer: [{params, at}] (seconds). */
  async playSequence(events) {
    const ctx = await this.ensureContext();
    const sr = ctx.sampleRate;
    const rendered = events.map((e) => ({ at: Math.round(e.at * sr), s: renderDrum({ ...e.params, sampleRate: sr }) }));
    const len = Math.max(...rendered.map((r) => r.at + r.s.length));
    const mix = new Float32Array(len);
    for (const r of rendered) for (let i = 0; i < r.s.length; i++) mix[r.at + i] += r.s[i] * 0.7;
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(mix[i]));
    if (peak > 0.95) for (let i = 0; i < len; i++) mix[i] *= 0.95 / peak;
    return this.playSamples(mix);
  }

  /** Continuous reference sine; pass 0 to stop. */
  async setTone(freq) {
    if (!freq) {
      if (this.tone) {
        const { osc, gain } = this.tone;
        const t = this.ctx.currentTime;
        gain.gain.setTargetAtTime(0, t, 0.03);
        osc.stop(t + 0.2);
        this.tone = null;
      }
      this.muteUntil = this.ctx ? this.ctx.currentTime + 0.3 : 0;
      return;
    }
    const ctx = await this.ensureContext();
    if (!this.listening) this._setSession('playback');
    if (this.tone) {
      this.tone.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.35, ctx.currentTime, 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.tone = { osc, gain };
    this.muteUntil = Infinity; // don't analyze our own tone
  }
}
