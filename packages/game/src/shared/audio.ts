/** Synthesized SFX (WebAudio): no audio files. The context unlocks on the first user gesture. */
type Ctx = AudioContext;

export class Sfx {
  private ctx: Ctx | null = null;
  private noise: AudioBuffer | null = null;
  muted = localStorage.getItem("eurocrat-muted") === "1";

  unlock(): void {
    if (!this.ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem("eurocrat-muted", this.muted ? "1" : "0");
    return this.muted;
  }

  private ready(): Ctx | null {
    return this.muted || !this.ctx ? null : this.ctx;
  }

  private env(ctx: Ctx, t: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(ctx.destination);
    return g;
  }

  /** Rubber stamp on a desk: low thud + papery slap. */
  stamp(pitch = 1): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    o.connect(this.env(ctx, t, 0.9, 0.004, 0.16));
    o.start(t);
    o.stop(t + 0.2);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1600 * pitch;
    n.connect(f);
    f.connect(this.env(ctx, t, 0.55, 0.002, 0.07));
    n.start(t);
    n.stop(t + 0.1);
  }

  /** Mistral: the wrong-answer buzzer. */
  buzzer(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    f.connect(this.env(ctx, t, 0.35, 0.01, 0.7));
    for (const hz of [92, 97.5]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.75);
    }
  }

  /** A model escaped into the single market. */
  escape(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.14);
    o.connect(this.env(ctx, t, 0.12, 0.005, 0.14));
    o.start(t);
    o.stop(t + 0.18);
  }

  /** Empty hole: dry tap. */
  tap(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2400;
    n.connect(f);
    f.connect(this.env(ctx, t, 0.18, 0.002, 0.03));
    n.start(t);
    n.stop(t + 0.05);
  }

  beep(hz = 660, dur = 0.12, vol = 0.18): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = hz;
    o.connect(this.env(ctx, t, vol, 0.005, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** "Approved." — a small bureaucratic fanfare. */
  approved(): void {
    [523.25, 659.25, 783.99].forEach((hz, i) => setTimeout(() => this.beep(hz, 0.16, 0.12), i * 70));
  }

  /** End of round: the office bell. */
  bell(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [hz, v] of [[880, 0.2], [1320, 0.08], [2210, 0.04]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      o.connect(this.env(ctx, t, v, 0.004, 1.1));
      o.start(t);
      o.stop(t + 1.2);
    }
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
