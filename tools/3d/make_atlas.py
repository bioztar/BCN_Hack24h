"""Build the texture atlas for an officer bust: photo on top, 3 flat swatches below.

usage: make_atlas.py <cutout.png> <out_atlas.png> [hair_xy skin_xy suit_xy as x,y,x,y,x,y]
Swatch colours are the mean of a 24px patch of the photo at the given points.
"""
import sys
from PIL import Image
import numpy as np

SWATCH_H = 64


def patch_mean(rgba, x, y, r=12):
    p = rgba[y - r:y + r, x - r:x + r].reshape(-1, 4).astype(float)
    p = p[p[:, 3] > 200]
    return tuple(int(v) for v in p[:, :3].mean(axis=0))


def main(src, dst, pts):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    hair, skin, suit = (patch_mean(a, pts[i], pts[i + 1]) for i in (0, 2, 4))
    w, h = im.size
    out = Image.new("RGB", (w, h + SWATCH_H), suit)
    out.paste(im, (0, 0), im)  # transparent bg shows suit colour, no black holes
    for i, c in enumerate((hair, skin, suit)):
        out.paste(c, (i * w // 3, h, (i + 1) * w // 3, h + SWATCH_H))
    out.save(dst)
    print("atlas", out.size, "hair", hair, "skin", skin, "suit", suit)


if __name__ == "__main__":
    pts = [int(v) for v in sys.argv[3].split(",")] if len(sys.argv) > 3 else [248, 170, 320, 350, 640, 580]
    main(sys.argv[1], sys.argv[2], pts)
