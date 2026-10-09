"""Photo atlas + palette for an officer.

usage: make_atlas.py <cutout.png> <out_atlas.png> <out_palette.json> <hx,hy,sx,sy,ux,uy>
Atlas = photo (transparent bg composited on the suit colour) + a 64px strip below it.
Palette = mean colour of a 24px patch of the photo at each point (hair, skin, suit).
"""
import json
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import distance_transform_edt

STRIP_H = 64


def patch_mean(rgba, x, y, r=12):
    p = rgba[y - r:y + r, x - r:x + r].reshape(-1, 4).astype(float)
    p = p[p[:, 3] > 200]
    return [int(v) for v in p[:, :3].mean(axis=0)]


def main(src, dst, pal_path, pts):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    hair, skin, suit = (patch_mean(a, pts[i], pts[i + 1]) for i in (0, 2, 4))
    w, h = im.size
    # erode alpha ~2px so the dark cut-out fringe is dropped, then flood the background with the
    # nearest subject colour so side projection streaks carry hair/suit colour, not black.
    alpha = im.getchannel("A").filter(ImageFilter.MinFilter(5))
    subject = np.array(alpha) > 127
    idx = distance_transform_edt(~subject, return_distances=False, return_indices=True)
    rgb = a[..., :3][idx[0], idx[1]]
    out = Image.new("RGB", (w, h + STRIP_H), tuple(suit))
    out.paste(Image.fromarray(rgb.astype(np.uint8)), (0, 0))
    out.save(dst)
    with open(pal_path, "w") as f:
        json.dump({"hair": hair, "skin": skin, "suit": suit}, f)
    print("palette", "hair", hair, "skin", skin, "suit", suit)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], [int(v) for v in sys.argv[4].split(",")])
