export interface Vec3 { x: number; y: number; z: number; }

/**
 * Gravity direction (unit) in the device frame — x right, y towards the top of the screen,
 * z out of the screen — from DeviceOrientation Euler angles (degrees, W3C Z-X'-Y'').
 * Upright portrait → (0,-1,0); flat on a table → (0,0,-1). Independent of the
 * iOS/Android accelerationIncludingGravity sign mess.
 */
export function gravityFromOrientation(betaDeg: number, gammaDeg: number): Vec3 {
  const b = (betaDeg * Math.PI) / 180;
  const g = (gammaDeg * Math.PI) / 180;
  return { x: Math.cos(b) * Math.sin(g), y: -Math.sin(b), z: -Math.cos(b) * Math.cos(g) };
}

/** Rotates a device-frame vector into the current screen frame (landscape support). */
export function toScreenFrame(v: Vec3, screenAngleDeg: number): Vec3 {
  const a = (-screenAngleDeg * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a), z: v.z };
}

export function lowPass(prev: Vec3, next: Vec3, alpha: number): Vec3 {
  return { x: prev.x + (next.x - prev.x) * alpha, y: prev.y + (next.y - prev.y) * alpha, z: prev.z + (next.z - prev.z) * alpha };
}

/** Shake = `peaks` acceleration spikes above `threshold` (m/s², gravity excluded) within `windowMs`. */
export class ShakeDetector {
  private peaks: number[] = [];
  private lastShake = -Infinity;
  private above = false;
  constructor(
    private threshold = 14,
    private needed = 3,
    private windowMs = 900,
    private cooldownMs = 1500,
  ) {}

  /** Feed one sample; returns true when a shake is recognised. */
  sample(ax: number, ay: number, az: number, tMs: number): boolean {
    const mag = Math.hypot(ax, ay, az);
    const isAbove = mag > this.threshold;
    let fired = false;
    if (isAbove && !this.above) {
      this.peaks = this.peaks.filter((t) => tMs - t < this.windowMs);
      this.peaks.push(tMs);
      if (this.peaks.length >= this.needed && tMs - this.lastShake > this.cooldownMs) {
        this.lastShake = tMs;
        this.peaks = [];
        fired = true;
      }
    }
    this.above = isAbove;
    return fired;
  }
}

/** Tracks how long nothing has happened; `asleep` after `limitS` seconds of stillness. */
export class Stillness {
  private still = 0;
  asleep = false;
  constructor(private limitS = 20) {}

  /** `active` = anything moved this frame. Returns "sleep" / "wake" on transitions. */
  tick(dt: number, active: boolean): "sleep" | "wake" | null {
    if (active) {
      this.still = 0;
      if (this.asleep) {
        this.asleep = false;
        return "wake";
      }
      return null;
    }
    this.still += dt;
    if (!this.asleep && this.still >= this.limitS) {
      this.asleep = true;
      return "sleep";
    }
    return null;
  }

  poke(): "wake" | null {
    return this.tick(0, true) === "wake" ? "wake" : null;
  }
}
