"""Hunyuan3D-2mini shape-only spike on MPS. usage: shape_spike.py <rgba.png> <out.glb> [steps]"""
import sys
import time
from pathlib import Path

import torch
from huggingface_hub import hf_hub_download
from PIL import Image

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE / "h3d"))
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline  # noqa: E402

src, dst = sys.argv[1], sys.argv[2]
steps = int(sys.argv[3]) if len(sys.argv) > 3 else 30
repo, sub = "tencent/Hunyuan3D-2mini", "hunyuan3d-dit-v2-mini"
cfg = hf_hub_download(repo, f"{sub}/config.yaml", local_dir=HERE / "weights")
ckpt = hf_hub_download(repo, f"{sub}/model.fp16.safetensors", local_dir=HERE / "weights")
device = "mps" if torch.backends.mps.is_available() else "cpu"
t0 = time.time()
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_single_file(
    str(ckpt), cfg, device=device, dtype=torch.float16, use_safetensors=True
)
print("loaded", round(time.time() - t0), "s on", device, flush=True)
img = Image.open(src).convert("RGBA")
t0 = time.time()
mesh = pipe(image=img, num_inference_steps=steps, octree_resolution=256, num_chunks=20000,
            generator=torch.manual_seed(7), output_type="trimesh")[0]
print("meshed", round(time.time() - t0), "s", len(mesh.vertices), "verts", flush=True)
mesh.export(dst)
