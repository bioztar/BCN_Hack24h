import { describe, expect, it } from "vitest";
import { headCrop } from "../src/cutout";

function alphaMap(w: number, h: number, opaque: (x: number, y: number) => boolean): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = opaque(x, y) ? 255 : 0;
  return a;
}

describe("headCrop", () => {
  it("takes a square from the top of a tall transparent bust", () => {
    const a = alphaMap(100, 200, (x, y) => x >= 30 && x < 70 && y >= 20 && y < 190);
    expect(headCrop(a, 100, 200)).toEqual({ x: 30, y: 20, size: 40 });
  });
  it("uses the top-centre square of a fully opaque image", () => {
    const a = alphaMap(100, 160, () => true);
    expect(headCrop(a, 100, 160)).toEqual({ x: 0, y: 0, size: 100 });
  });
  it("is limited by height for a wide cutout", () => {
    const a = alphaMap(200, 100, (x, y) => x >= 10 && x < 190 && y >= 40 && y < 100);
    expect(headCrop(a, 200, 100)).toEqual({ x: 70, y: 40, size: 60 });
  });
  it("falls back to the whole image when fully transparent", () => {
    expect(headCrop(new Uint8Array(50 * 80), 50, 80)).toEqual({ x: 0, y: 0, size: 50 });
  });
});
