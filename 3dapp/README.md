# Actora 3D

A WebGPU-only 3D client of Actora built around an animated character: three.js `WebGPURenderer` with React Three Fiber v9. It lives beside the 2D app and doesn't touch it. The root build, Docker image and Cloud Run deploy all ignore this folder.

## How it shares the 2D app's brain

`@actora/*` is an alias for `../src/*`. The socket, chat state machine, ui_action router, stores, options and priority ranking are the same code the 2D app runs, imported unchanged. `vite.config.ts` dedupes `react`, `zustand` and `three` so that `../src` and this app share one copy of each store. Without that, the socket would fill one set of stores and the scene would read another.

Don't import from `../src/ui/**` beyond its pure helpers (`markdownText`, `format`, `tiles/data`). The rest is DOM, Tailwind and motion code.

## Run

```sh
npm install            # at the repo root too: ../src's own deps (supabase, …) resolve from there
cd 3dapp
npm install
npm run placeholder    # optional: rigged stand-in character (three.js Xbot)
npm run dev            # http://localhost:5174, in Chrome/Edge/Safari with WebGPU
```

With no `.env`, it runs against the in-browser mock backend. Real sign-in on port 5174 needs `http://localhost:5174` added to Supabase's redirect URLs and to Aelora's `AELORA_CORS_ORIGINS`.

## The character

USD is the source and GLB is what runs, because three.js can't play UsdSkel animation.

1. Put the file in `assets-src/` (not committed).
2. `npm run usd -- assets-src/character.usdz public/models/character.glb` (needs Blender on PATH).
3. Map clip names in [src/character.ts](src/character.ts). Each phase (`idle`, `thinking`, `tool`, `speaking`, `offline`) gets a looping clip. Reactions (`positive`, `negative`, `cognitive`) get one-shot emotes, layered additively.

The loader tries `character.glb`, then `placeholder.glb`, and finally falls back to a capsule.

**What the USD should contain:** a skinned mesh with at least `idle`, `talk` and `think` clips, plus a few emotes. A head bone matching `/head$/i` lets speech nod along with the token stream. Viseme blendshapes are optional and only matter once there's a TTS voice to sync them to.
