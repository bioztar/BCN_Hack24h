import { levelFromSamples } from "./level";
/** Synthesised SFX (WebAudio) — no audio assets needed. Quiet so TTS stays on top. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Routes an <audio> element through an AnalyserNode and returns a 0..1 loudness getter
 * for the puppet's jaw. Only when the context is running — otherwise the element would be
 * silenced — so callers must fall back to a fake flap on null.
 */
export function analyse(audio: HTMLMediaElement): (() => number) | null {
  const c = ctx;
  if (!c || c.state !== "running") return null;
  try {
    const src = c.createMediaElementSource(audio);
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    an.connect(c.destination);
    const buf = new Uint8Array(an.fftSize);
    return () => {
      an.getByteTimeDomainData(buf);
      return levelFromSamples(buf);
    };
  } catch {
    return null;
  }
}

/** Call from a user gesture so later SFX and <audio> may autoplay. */
export function unlockAudio(): void {
  ac();
}

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

export function thud(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  g.connect(c.destination);
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + 0.36);
  const n = noise(c, 0.18);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const ng = c.createGain();
  ng.gain.value = 0.35;
  n.connect(lp).connect(ng).connect(c.destination);
  n.start(t);
}

export function tick(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const n = noise(c, 0.02);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const g = c.createGain();
  g.gain.value = 0.08;
  n.connect(hp).connect(g).connect(c.destination);
  n.start(t);
}

/** Airport ding-dong. */
export function chime(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  [
    [659, 0],
    [523, 0.32],
  ].forEach(([f, at]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f!;
    g.gain.setValueAtTime(0.0001, t + at!);
    g.gain.exponentialRampToValueAtTime(0.12, t + at! + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at! + 0.9);
    o.connect(g).connect(c.destination);
    o.start(t + at!);
    o.stop(t + at! + 1);
  });
}

/** "A third voice joins from the Council" — muffled murmur and a cough. */
export function council(): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < 6; i++) {
    const n = noise(c, 0.25);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 300 + Math.random() * 500;
    bp.Q.value = 6;
    const g = c.createGain();
    g.gain.value = i === 5 ? 0.5 : 0.18;
    n.connect(bp).connect(g).connect(c.destination);
    n.start(t + i * 0.22 + (i === 5 ? 0.4 : 0));
  }
}

/** Mock/rehearsal only (`?speak=1`): Web Speech for lines that have no audioUrl. */
export function speak(text: string, speaker: string): Promise<void> | null {
  if (typeof speechSynthesis === "undefined") return null;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const hash = [...speaker].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    if (voices.length) u.voice = voices[hash % voices.length]!;
    u.pitch = 0.6 + (hash % 7) / 10;
    u.rate = 0.95;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
