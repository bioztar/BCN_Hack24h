let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("flappy.muted") === "1";
  } catch {
    return false;
  }
})();

export const isMuted = (): boolean => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem("flappy.muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number): void {
  if (!ctx || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  flap: () => tone("triangle", 380, 720, 0.09, 0.12),
  point: () => {
    tone("square", 880, 880, 0.06, 0.05);
    tone("square", 1320, 1320, 0.09, 0.05, 0.06);
  },
  pickup: () => [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.1, 0.09, i * 0.06)),
  warp: () => tone("sawtooth", 200, 60, 0.5, 0.08),
  bounce: () => tone("sine", 300, 140, 0.12, 0.12),
  crash: () => {
    noise(0.35, 0.5, 900);
    tone("sine", 140, 40, 0.35, 0.35);
  },
  stamp: () => {
    noise(0.12, 0.7, 2200);
    tone("sine", 90, 50, 0.18, 0.5);
  },
};

export const buzz = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};
