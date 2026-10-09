"""Full pipeline for one officer. usage: run_officer.py <name>   (run from the worktree root, with the tools/3d venv)

atlas+palette -> depth -> blender build/bake/export/sim -> contact sheet.
Inputs: tools/3d/work/<name>-neutral.png (RGBA cut-out). Outputs: assets/generated/3d/<name>.*
"""
import json
import subprocess
import sys
from pathlib import Path

name = sys.argv[1]
root = Path.cwd()
t3 = root / "tools/3d"
work, out = t3 / "work", root / "assets/generated/3d"
out.mkdir(parents=True, exist_ok=True)
py = str(t3 / ".venv/bin/python")
pts = ",".join(str(v) for v in json.load(open(t3 / "officers.json"))[name]["pts"])
cut = work / f"{name}-neutral.png"

subprocess.run([py, str(t3 / "make_atlas.py"), cut, work / f"{name}-atlas.png", work / f"{name}-palette.json", pts], check=True)
if not (work / f"{name}-depth.png").exists():
    subprocess.run([py, str(t3 / "make_depth.py"), cut, work / f"{name}-depth.png"], check=True)
subprocess.run(["blender", "-b", "--python", str(t3 / "build_bust.py"), "--",
                work / f"{name}-atlas.png", work / f"{name}-depth.png", work / f"{name}-palette.json", out, name], check=True)
subprocess.run([py, str(t3 / "contact_sheet.py"), str(out), name], check=True)
