# Agents

The agent guide for this repo is [CLAUDE.md](CLAUDE.md) (and [3dapp/CLAUDE.md](3dapp/CLAUDE.md) for the 3D app). It
applies to every coding agent, not only Claude.

The rule agents most often break: **graphics are WebGPU + TSL only.** No WebGL, no GLSL, no raw WGSL, no other GPU
library. `npm run guard` checks it, and both builds refuse to build without it. See
[docs/agents/graphics.md](docs/agents/graphics.md).
