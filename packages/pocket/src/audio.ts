// All SFX are synthesised: nothing depends on an audio asset existing.

export interface Voice { pitch: number; wave: OscillatorType; rate: number; }

const VOICES: Record<string, Voice> = {
  formblatt: { pitch: 105, wave: "sawtooth", rate: 8 },
  annexe: { pitch: 210, wave: "triangle", rate: 11 },
  "grandma-gdpr": { pitch: 260, wave: "triangle", rate: 9 },
  "auditor-9000": { pitch: 140, wave: "square", rate: 13 },
  "de-vries": { pitch: 130, wave: "square", rate: 14 },
  "the-cookie": { pitch: 380, wave: "triangle", rate: 13 },
};

export function voiceFor(id: string): Voice {
  return VOICES[id] ?? { pitch: 170, wave: "triangle", rate: 11 };
}

export interface Playback {
  /** 0..1 loudness right now, for the jaw. */
  level(): number;
  done: Promise<void>;
  stop(): void;
}

type Ctx = AudioContext;

export class Sound {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
        const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = n;
      }
      if (this.ctx.state !== "running") void this.ctx.resume();
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* no audio: subtitles carry the show */
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running" && !this.muted;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, type: OscillatorType, peak: number, attack: number, decay: number, at = 0, glideTo?: number): void {
    if (!this.ready) return;
    const c = this.ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private burst(peak: number, decay: number, filterHz: number, q = 1, at = 0, type: BiquadFilterType = "lowpass"): void {
    if (!this.ready || !this.noise) return;
    const c = this.ctx!;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterHz;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, peak, 0.004, decay);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + decay + 0.05);
  }

  thud(strength = 1): void {
    const k = Math.min(1, strength / 6);
    this.tone(90 + 40 * k, "sine", 0.3 + 0.5 * k, 0.005, 0.18, 0, 45);
    this.burst(0.25 + 0.4 * k, 0.12, 600);
  }

  stamp(): void {
    this.tone(70, "sine", 0.9, 0.003, 0.25, 0, 38);
    this.burst(0.8, 0.09, 1800);
    this.burst(0.25, 0.25, 3500, 0.7, 0.05, "bandpass");
  }

  ding(): void {
    this.tone(1318, "sine", 0.35, 0.003, 1.1);
    this.tone(2637, "sine", 0.08, 0.003, 0.6);
  }

  rustle(): void {
    for (let i = 0; i < 3; i++) this.burst(0.12, 0.08, 4000 + Math.random() * 2000, 1.5, i * 0.05, "bandpass");
  }

  snore(): void {
    if (!this.ready) return;
    this.burst(0.15, 1.1, 300, 4, 0, "bandpass");
    this.tone(70, "sawtooth", 0.06, 0.6, 0.6);
  }

  printer(): void {
    for (let i = 0; i < 14; i++) this.burst(0.18, 0.025, 2500, 3, i * 0.045, "bandpass");
  }

  council(): void {
    [196, 233, 277].forEach((f, i) => this.tone(f, "sawtooth", 0.14, 0.05, 1.4, i * 0.08));
    this.tone(55, "sine", 0.5, 0.02, 1.6);
  }

  approve(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, "triangle", 0.2, 0.01, 0.25, i * 0.09));
  }

  /** Bureaucratese babble — one formant blip per syllable — when a line has no TTS audio. */
  mumble(text: string, v: Voice): Playback {
    const syll = Math.max(3, Math.round(text.replace(/[^a-zà-ÿ]/gi, "").length / 2.6));
    const step = 1 / v.rate;
    const dur = Math.max(1.6, syll * step + 0.3);
    const start = performance.now();
    const blips: number[] = [];
    if (this.ready) {
      const c = this.ctx!;
      const t0 = c.currentTime + 0.05;
      for (let i = 0; i < syll; i++) {
        if (Math.random() < 0.12) continue;
        blips.push(i * step);
        const t = t0 + i * step;
        const o = c.createOscillator();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        o.type = v.wave;
        o.frequency.setValueAtTime(v.pitch * (0.85 + Math.random() * 0.35), t);
        f.type = "bandpass";
        f.frequency.value = 700 + Math.random() * 1400;
        f.Q.value = 2;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.85);
        o.connect(f).connect(g).connect(this.master!);
        o.start(t);
        o.stop(t + step);
      }
    } else for (let i = 0; i < syll; i++) blips.push(i * step);
    let stopped = false;
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));
    const timer = setTimeout(resolveDone, dur * 1000);
    return {
      level: () => {
        if (stopped) return 0;
        const t = (performance.now() - start) / 1000;
        const phase = (t % step) / step;
        return t < syll * step ? Math.sin(Math.PI * phase) * 0.9 : 0;
      },
      done,
      stop: () => {
        stopped = true;
        clearTimeout(timer);
        resolveDone();
      },
    };
  }

  /** Plays a TTS clip through WebAudio so the jaw can follow the waveform. */
  async play(url: string): Promise<Playback> {
    if (!this.ctx || this.muted) throw new Error("audio locked");
    const c = this.ctx;
    const buf = await c.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const src = c.createBufferSource();
    src.buffer = buf;
    const an = c.createAnalyser();
    an.fftSize = 512;
    const data = new Uint8Array(an.fftSize);
    src.connect(an).connect(this.master!);
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));
    src.onended = () => resolveDone();
    src.start();
    return {
      level: () => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / data.length) * 5);
      },
      done,
      stop: () => {
        try { src.stop(); } catch { /* already stopped */ }
        resolveDone();
      },
    };
  }
}

export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch { /* unsupported (iOS Safari) */ }
}
