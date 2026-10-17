// Original 16-bar lantern theme: a warm minor-key music-box motif, soft
// plucked answers, walking bass and a brushed pulse. No recordings are loaded.
const hz = (midi) => midi ? 440 * 2 ** ((midi - 69) / 12) : 0;
const beat = 60 / 84;
const chords = [
  [50, 57, 60, 65], [46, 53, 57, 62], [53, 60, 64, 67], [48, 55, 57, 64],
  [43, 50, 57, 62], [50, 57, 60, 65], [52, 58, 62, 67], [45, 52, 55, 61],
  [50, 57, 60, 65], [46, 53, 57, 62], [53, 60, 64, 69], [48, 55, 59, 64],
  [43, 50, 57, 62], [46, 53, 57, 62], [45, 52, 55, 61], [50, 57, 60, 65],
];
export const AMBIENT_SCORE = Object.freeze({
  bpm: 84,
  chordSeconds: beat * 4,
  chords: chords.map((chord) => chord.map(hz)),
  melody: [
    69, 0, 72, 74, 0, 72, 69, 67, 65, 0, 69, 72, 0, 69, 67, 0,
    67, 0, 71, 72, 74, 0, 72, 67, 64, 0, 67, 69, 0, 67, 64, 0,
    69, 0, 72, 74, 77, 0, 74, 72, 69, 0, 65, 69, 72, 0, 69, 0,
    67, 0, 70, 74, 0, 72, 70, 67, 69, 0, 73, 76, 0, 73, 69, 0,
    77, 0, 76, 74, 0, 72, 74, 69, 74, 0, 72, 69, 0, 65, 69, 0,
    72, 0, 76, 79, 0, 76, 72, 69, 67, 0, 71, 74, 0, 72, 67, 0,
    70, 0, 69, 67, 74, 0, 72, 70, 69, 0, 65, 62, 0, 65, 69, 0,
    73, 0, 76, 79, 0, 76, 73, 69, 74, 0, 72, 69, 65, 0, 62, 0,
  ].map(hz),
  noteSeconds: beat / 2,
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
    this.beat = 0;
    this.nextBeat = 0;
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
    filter.frequency.value = 2200;
    this.music.connect(filter);
    filter.connect(c.destination);
    const reverb = c.createConvolver(),
      wet = c.createGain();
    wet.gain.value = 0.24;
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
  noise(start, length, volume, bus, frequency = 1500, type = "bandpass") {
    const c = this.context;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(start);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect(); filter.disconnect(); gain.disconnect();
    };
  }
  schedule() {
    if (!this.context || this.context.state !== "running" || this.musicMuted || this.paused || this.muted) return;
    const now = this.context.currentTime, horizon = now + 0.3;
    if (this.nextChord < now - 0.3) this.nextChord = now + 0.08;
    if (this.nextNote < now - 0.3) this.nextNote = now + 0.08;
    if (this.nextBeat < now - 0.3) this.nextBeat = now + 0.08;
    while (this.nextChord < horizon) {
      const chord = AMBIENT_SCORE.chords[this.chord++ % AMBIENT_SCORE.chords.length];
      for (const frequency of chord)
        this.tone(frequency, this.nextChord, 4.1, 0.011, this.music, "sine", 0.7);
      this.nextChord += AMBIENT_SCORE.chordSeconds;
    }
    while (this.nextNote < horizon) {
      const step = this.note++ % AMBIENT_SCORE.melody.length;
      const frequency = AMBIENT_SCORE.melody[step];
      const start = this.nextNote + (step % 2 ? beat * 0.08 : 0);
      if (frequency) {
        const volume = step < 64 ? 0.029 : 0.034;
        this.tone(frequency, start, 1.25, volume, this.music, "sine", 0.012);
        this.tone(frequency, start, 0.32, 0.006, this.music, "triangle", 0.008);
        this.tone(frequency * 2, start, 0.55, 0.003, this.music, "sine", 0.008);
        // A quiet answer gives the motif a sense of space and continuity.
        if (step % 4 === 0)
          this.tone(frequency, start + beat * 0.75, 0.85, 0.006, this.music, "sine", 0.018);
      } else if (step % 4 === 1) {
        const chord = AMBIENT_SCORE.chords[Math.floor(step / 8)];
        this.tone(chord[2] * 2, start, 0.8, 0.008, this.music, "sine", 0.02);
      }
      this.nextNote += AMBIENT_SCORE.noteSeconds;
    }
    while (this.nextBeat < horizon) {
      const step = this.beat++ % 64;
      const chord = AMBIENT_SCORE.chords[Math.floor(step / 4)];
      const pulse = step % 4;
      if (pulse !== 1) {
        const bass = chord[pulse === 2 ? 1 : 0] / 2;
        this.tone(bass, this.nextBeat, beat * 0.85, 0.028, this.music, "triangle", 0.018);
        this.tone(bass * 2, this.nextBeat, 0.24, 0.005, this.music, "sine", 0.012);
      }
      if (pulse % 2) this.noise(this.nextBeat + beat * 0.04, 0.07, 0.012, this.music, 2200, "highpass");
      else this.tone(175, this.nextBeat, 0.065, 0.008, this.music, "triangle", 0.004);
      this.nextBeat += beat;
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
    if (kind === "toolBreak") {
      const start = this.context.currentTime;
      this.noise(start, 0.22, 0.075, this.effects, 1700);
      this.tone(185, start, 0.18, 0.028, this.effects, "triangle", 0.004);
      this.tone(680, start + 0.035, 0.16, 0.008, this.effects, "sine", 0.004);
      return;
    }
    if (kind === "explosion") {
      const c = this.context, start = c.currentTime;
      this.noise(start, 0.46, 0.17, this.effects, 1500, "lowpass");
      const osc = c.createOscillator(), gain = c.createGain();
      osc.frequency.setValueAtTime(115, start);
      osc.frequency.exponentialRampToValueAtTime(34, start + 0.4);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
      osc.connect(gain); gain.connect(this.effects);
      osc.start(start); osc.stop(start + 0.5);
      this.voices.add(osc);
      osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
      this.tone(410, start + 0.06, 0.24, 0.014, this.effects, "triangle", 0.004);
      return;
    }
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
