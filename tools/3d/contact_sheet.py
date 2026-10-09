"""usage: contact_sheet.py <3d dir> <name> -> <name>_sheet.png (turntable row over fall row)"""
import sys
from PIL import Image

d, name = sys.argv[1:3]
turn = [f"{d}/{name}_turn_{i}.png" for i in range(6)]
fall = [f"{d}/{name}_fall_{f:02d}.png" for f in (1, 15, 30, 45, 60, 90)]
ims = [[Image.open(p) for p in row] for row in (turn, fall)]
w, h = ims[0][0].size
sheet = Image.new("RGB", (w * 6, h * 2))
for r, row in enumerate(ims):
    for c, im in enumerate(row):
        sheet.paste(im, (c * w, r * h))
sheet.save(f"{d}/{name}_sheet.png")
print(f"{d}/{name}_sheet.png", sheet.size)
