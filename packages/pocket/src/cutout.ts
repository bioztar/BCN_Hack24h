import * as THREE from "three";
import type { Rig } from "./figures";

export function cutoutUrl(personaId: string): string {
  return `/assets/generated/cutout/${encodeURIComponent(personaId)}-neutral.png`;
}

export interface Crop { x: number; y: number; size: number; }

/**
 * Square crop around the head of a transparent-background portrait: the
 * opaque bounding box's width, taken from its top (bust → face; headshot → itself).
 */
export function headCrop(alpha: ArrayLike<number>, w: number, h: number, threshold = 24): Crop {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x]! > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, size: Math.min(w, h) };
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const opaque = bw === w && bh === h;
  // A full-bleed (non-cutout) image or a tall bust: take a square from the top centre.
  const size = Math.min(opaque ? Math.min(w, h) : bw, bh, w, h);
  const cx = opaque ? w / 2 : x0 + bw / 2;
  const x = Math.round(Math.min(Math.max(0, cx - size / 2), w - size));
  return { x, y: opaque ? 0 : y0, size };
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Square, head-cropped canvas of a cutout, or null when it can't be read. */
export function headCanvas(img: HTMLImageElement, out = 256): HTMLCanvasElement | null {
  try {
    const sw = Math.min(img.naturalWidth, 512);
    const sh = Math.round((img.naturalHeight / img.naturalWidth) * sw);
    const probe = document.createElement("canvas");
    probe.width = sw;
    probe.height = sh;
    const pg = probe.getContext("2d", { willReadFrequently: true })!;
    pg.drawImage(img, 0, 0, sw, sh);
    const data = pg.getImageData(0, 0, sw, sh).data;
    const alpha = new Uint8Array(sw * sh);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
    const c = headCrop(alpha, sw, sh);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    canvas.getContext("2d")!.drawImage(probe, c.x, c.y, c.size, c.size, 0, 0, out, out);
    return canvas;
  } catch {
    return null;
  }
}

const cutouts = new Map<string, Promise<HTMLImageElement | null>>();

/** One request per persona per page session; a miss (404) is cached too. */
export function loadCutout(personaId: string): Promise<HTMLImageElement | null> {
  let p = cutouts.get(personaId);
  if (!p) {
    p = loadImage(cutoutUrl(personaId));
    cutouts.set(personaId, p);
  }
  return p;
}

/** Mounts the persona's cutout as a face plane if the asset exists; keeps the procedural face otherwise. */
export async function tryApplyCutout(rig: Rig, personaId: string): Promise<boolean> {
  const m = rig.faceMount;
  if (!m) return false;
  const img = await loadCutout(personaId);
  const canvas = img && headCanvas(img);
  if (!canvas) return false;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(m.size, m.size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }),
  );
  plane.position.set(0, m.y, m.z);
  m.parent.add(plane);
  for (const p of rig.faceParts) p.visible = false;
  return true;
}
