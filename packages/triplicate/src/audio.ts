/** Synthesized WebAudio SFX — no audio files. */
let ctx: AudioContext | null = null;
let muted = localStorage.getItem("triplicate.muted") === "1";

export const isMuted = () => muted;
export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem("triplicate.muted", m ? "1" : "0");
}

export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number): void {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
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

function noise(dur: number, gain: number, freq: number, at = 0): void {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  move: () => tone(880, 0.03, "square", 0.025),
  rotate: () => tone(660, 0.06, "triangle", 0.05, 0, 990),
  filed: () => { noise(0.08, 0.35, 1800); tone(170, 0.12, "sine", 0.3); },
  junk: () => { tone(110, 0.25, "sawtooth", 0.09); tone(104, 0.25, "sawtooth", 0.07); },
  clear: (chain: number) => {
    const base = 523 * 2 ** ((chain - 1) / 4);
    [1, 1.26, 1.5].forEach((m, i) => tone(base * m, 0.18, "triangle", 0.12, i * 0.07));
    noise(0.14, 0.5, 900, 0.22);
    tone(120, 0.2, "sine", 0.4, 0.22);
  },
  omnibus: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, "sine", 0.08, i * 0.06)),
  level: () => [440, 554, 659].forEach((f, i) => tone(f, 0.12, "square", 0.04, i * 0.05)),
  over: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, i * 0.18)); noise(0.2, 0.5, 600, 0.75); },
};

export function buzz(ms: number): void {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
