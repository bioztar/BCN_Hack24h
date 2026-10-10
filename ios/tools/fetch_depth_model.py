"""Download Apple's CoreML Depth Anything V2 small (~50 MB) and compile it.

usage: uv run --with huggingface_hub python fetch_depth_model.py <out_dir>
Then: xcrun coremlcompiler compile <out_dir>/<name>.mlpackage <out_dir>
"""
import sys
from huggingface_hub import snapshot_download

out = sys.argv[1]
path = snapshot_download(
    repo_id="apple/coreml-depth-anything-v2-small",
    allow_patterns=["DepthAnythingV2SmallF16.mlpackage/*"],
    local_dir=out,
)
print(path)
