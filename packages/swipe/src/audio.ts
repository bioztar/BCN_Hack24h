export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) this.ctx = new AC();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }

  stamp(): void {
    this.noise(0.14, 0.9, 1800);
    this.tone(110, 0.16, "sine", 0.7, 50);
    vibrate(15);
  }

  right(): void {
    this.tone(660, 0.09, "triangle", 0.25);
    setTimeout(() => this.tone(990, 0.12, "triangle", 0.22), 70);
  }

  wrong(): void {
    this.tone(180, 0.32, "square", 0.12, 90);
    vibrate([20, 40, 20]);
  }

  tick(): void {
    this.tone(1400, 0.03, "square", 0.05);
  }

  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle", 0.2), i * 110));
  }
}

function vibrate(p: number | number[]): void {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
}
