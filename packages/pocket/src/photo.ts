/** Fits w×h inside a max×max box, never upscaling. */
export function fitSize(w: number, h: number, max = 512): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export const PHOTO_MAX_BYTES = 400_000;

/** Approximate decoded byte size of a base64 data URL. */
export function dataUrlBytes(url: string): number {
  const i = url.indexOf(",");
  const b64 = i >= 0 ? url.slice(i + 1) : url;
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

/** Downscales a selfie to ≤512 px JPEG data URL (≤400 KB), or null if the browser can't decode it. */
export async function selfieDataUrl(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = url;
    });
    if (!img) return null;
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
    if (!w) return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const d = c.toDataURL("image/jpeg", q);
      if (dataUrlBytes(d) <= PHOTO_MAX_BYTES) return d;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
