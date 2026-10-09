"""Depth Anything V2 small -> 16-bit PNG depth (near=white) aligned with the cutout.
usage: make_depth.py <cutout.png> <out_depth.png>
Subject depth is normalised to 0..1 over alpha>0.5; background 0.
"""
import sys

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

src, dst = sys.argv[1:3]
rgba = Image.open(src).convert("RGBA")
bg = Image.new("RGB", rgba.size, (128, 128, 128))
bg.paste(rgba, (0, 0), rgba)
name = "depth-anything/Depth-Anything-V2-Small-hf"
proc = AutoImageProcessor.from_pretrained(name)
model = AutoModelForDepthEstimation.from_pretrained(name).eval()
with torch.no_grad():
    out = model(**proc(images=bg, return_tensors="pt")).predicted_depth
d = torch.nn.functional.interpolate(out[None], size=rgba.size[::-1], mode="bicubic")[0, 0].numpy()
alpha = np.array(rgba)[..., 3] > 127
lo, hi = np.percentile(d[alpha], (1, 99))
d = np.clip((d - lo) / (hi - lo), 0, 1) * alpha
Image.fromarray((d * 65535).astype(np.uint16)).save(dst)
print("depth", d.shape, float(d[alpha].mean()))
