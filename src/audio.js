// Original 56-second ambient score in D major / B minor. Sparse felt-like
// notes float over slow add9 pads; no downloaded recordings or audio assets.
export const AMBIENT_SCORE = Object.freeze({
  chordSeconds: 7,
  chords: [
    [146.83, 220, 329.63],
    [196, 293.66, 440],
    [123.47, 185, 293.66],
    [164.81, 246.94, 369.99],
    [146.83, 220, 369.99],
    [196, 293.66, 440],
    [123.47, 220, 329.63],
    [164.81, 220, 329.63],
  ],
  melody: [
    440, 554.37, 659.25, 0, 587.33, 440, 369.99, 0, 493.88, 587.33, 739.99,
    659.25, 554.37, 0, 440, 0, 440, 659.25, 739.99, 0, 659.25, 587.33, 493.88,
    0, 369.99, 440, 554.37, 0, 493.88, 440, 329.63, 0,
  ],
  noteSeconds: 1.75,
});
export class GameAudio {
  constructor(muted = false, musicMuted = false) {
    this.muted = muted;
    this.musicMuted = musicMuted;
    this.paused = false;
    this.context = null;
    this.scheduler = null;
    this.chord = 0;
    this.note = 0;
    this.nextChord = 0;
    this.nextNote = 0;
    this.voices = new Set();
  }
  unlock() {
    if (!this.context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      this.context = new Audio();
      this.setupGraph();
    }
    this.sync();
  }
  setupGraph() {
    const c = this.context;
    this.effects = c.createGain();
    this.effects.gain.value = 0.7;
    this.effects.connect(c.destination);
    this.music = c.createGain();
    this.music.gain.value = this.musicMuted ? 0 : 0.48;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    this.music.connect(filter);
    filter.connect(c.destination);
    const reverb = c.createConvolver(),
      wet = c.createGain();
    wet.gain.value = 0.32;
    const impulse = c.createBuffer(
      2,
      Math.floor(c.sampleRate * 2.8),
      c.sampleRate,
    );
    let seed = 879;
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] =
          ((seed / 4294967296) * 2 - 1) * (1 - i / data.length) ** 3 * 0.4;
      }
    }
    reverb.buffer = impulse;
    filter.connect(reverb);
    reverb.connect(wet);
    wet.connect(c.destination);
  }
  setMuted(muted) {
    this.muted = muted;
    this.sync();
  }
  setMusicMuted(muted) {
    this.musicMuted = muted;
    this.music?.gain.setTargetAtTime(
      muted ? 0 : 0.48,
      this.context.currentTime,
      0.15,
    );
    this.sync();
  }
  setPaused(paused) {
    this.paused = paused;
    this.sync();
  }
  sync() {
    if (!this.context) return;
    if (this.paused || this.muted) {
      clearInterval(this.scheduler);
      this.scheduler = null;
      this.context.suspend().catch(() => {});
    } else {
      this.context
        .resume()
        .then(() => {
          if (this.paused || this.muted) return;
          if (this.musicMuted) {
            clearInterval(this.scheduler);
            this.scheduler = null;
            return;
          }
          if (!this.scheduler) {
            this.schedule();
            this.scheduler = setInterval(() => this.schedule(), 100);
          }
        })
        .catch(() => {});
    }
  }
  tone(
    hz,
    start,
    length,
    volume,
    bus,
    type = "sine",
    attack = 0.025,
    detune = 0,
  ) {
    const c = this.context,
      osc = c.createOscillator(),
      gain = c.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(start);
    osc.stop(start + length + 0.02);
    this.voices.add(osc);
    osc.onended = () => {
      this.voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
  }
  schedule() {
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.musicMuted ||
      this.paused ||
      this.muted
    )
      return;
    const now = this.context.currentTime,
      horizon = now + 0.3;
    if (this.nextChord < now - 0.3) this.nextChord = now + 0.08;
    if (this.nextNote < now - 0.3) this.nextNote = now + 0.5;
    while (this.nextChord < horizon) {
      const chord =
        AMBIENT_SCORE.chords[this.chord++ % AMBIENT_SCORE.chords.length];
      for (const hz of chord)
        this.tone(hz, this.nextChord, 9.5, 0.018, this.music, "sine", 1.9);
      this.tone(
        chord[0] / 2,
        this.nextChord,
        9,
        0.012,
        this.music,
        "sine",
        2.2,
      );
      this.nextChord += AMBIENT_SCORE.chordSeconds;
    }
    while (this.nextNote < horizon) {
      const hz =
        AMBIENT_SCORE.melody[this.note++ % AMBIENT_SCORE.melody.length];
      if (hz) {
        this.tone(hz, this.nextNote, 3.1, 0.027, this.music, "sine", 0.035);
        this.tone(hz * 2, this.nextNote, 1.4, 0.003, this.music, "sine", 0.025);
      }
      this.nextNote += AMBIENT_SCORE.noteSeconds;
    }
  }
  play(kind) {
    if (
      this.muted ||
      this.paused ||
      !this.context ||
      this.context.state !== "running"
    )
      return;
    const notes = {
      hit: [130],
      break: [240, 360],
      merge: [330, 440, 660],
      buy: [370, 490],
      win: [330, 440, 550, 660],
      error: [110],
      gem: [700, 1000],
      boss: [98, 146.83],
    }[kind] || [220];
    notes.forEach((hz, i) =>
      this.tone(
        hz,
        this.context.currentTime + i * 0.065,
        0.18,
        0.045 / notes.length,
        this.effects,
        kind === "hit" || kind === "boss" ? "triangle" : "sine",
        0.008,
      ),
    );
  }
  dispose() {
    clearInterval(this.scheduler);
    this.scheduler = null;
    for (const voice of this.voices)
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    this.voices.clear();
    this.context?.close().catch(() => {});
  }
}
