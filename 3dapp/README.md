# Actora 3D

A WebGPU-only 3D client of Actora built around an animated character: three.js `WebGPURenderer` with React Three Fiber v9. It lives beside the 2D app and doesn't touch it. The root build, Docker image and Cloud Run deploy all ignore this folder.

## How it shares the 2D app's brain

`@actora/*` is an alias for `../src/*`. The socket, chat state machine, ui_action router, stores, options and priority ranking are the same code the 2D app runs, imported unchanged. `vite.config.ts` dedupes `react`, `zustand` and `three` so that `../src` and this app share one copy of each store. Without that, the socket would fill one set of stores and the scene would read another.

Don't import from `../src/ui/**` beyond its pure helpers (`markdownText`, `format`, `tiles/data`). The rest is DOM, Tailwind and motion code.

## How it's built

- **The room** (`src/scene/room`): a procedural atrium in plain 70% white. The
  window wall is on the left, with the column, three steps up to a raised floor,
  and a mezzanine.
- **The light is the theming** (`Lighting.tsx`):
  - "Follows the sun" moves a real sun through the windows from today's sunrise
    to sunset. A chosen Day or Dusk uses a fixed sun.
  - Her mood tints the warm cove and the wall wash.
  - A ringing reminder makes the cove breathe red.
  - Reflections are captured once, from the room's own light.
- **Post** (`Post.tsx`): ambient occlusion (the UI layer excluded), bloom, and
  depth of field that blends in when a panel opens.
- **Home** (`look/layout.ts`):
  - She stands left of centre with her line as a caption over her head.
  - The four cards are drawn in WebGPU (`panels/`) as one 2×2 block to her
    right, in the same glass as the pills: the room behind them blurred, under a
    face painted on a canvas (`look/paint.ts`).
  - The 2D rail and the message box are real DOM, pinned in the room by an
    `Anchor`. So is her thinking (the 2D `Activity`).
  - Phones stack everything below her head and shoulders, with the camera held still.
- **Focus mode** (`FocusPanel3D.tsx`, `dom/Overlay.tsx`): when something opens,
  the camera comes in close on her.
  - The 2D app's own panel (chat, item, list, finds, vault) stands in the scene
    beside her through CSS3D, over WebGPU-drawn glass.
  - Its layout comes from the 2D `useMetrics`, re-pointed at that panel.
- **The character** (`Character.tsx`, `bridge/agentAnim.ts`): agent phase to
  clip, `avatar.react` to additive emotes, and a head nod with the token stream.
  She turns to face you.

## Run

```sh
npm install            # at the repo root too: ../src's own deps (supabase, …) resolve from there
cd 3dapp
npm install
npm run placeholder    # optional: rigged stand-in character (three.js Xbot)
npm run dev            # http://localhost:5173, in Chrome/Edge/Safari with WebGPU
```

It uses the same port (5173) and the same root `.env` as the 2D app, so sign-in and the backend work exactly as they do there, or the mock if that is what `.env` says. Run one app at a time. To load a different model, set `VITE_CHARACTER_URL` in the root `.env`.

## The character

USD is the source and GLB is what runs, because three.js can't play UsdSkel animation.

1. Put the file in `assets-src/` (not committed).
2. `npm run usd -- assets-src/character.usdz public/models/character.glb` (needs Blender on PATH).
3. Map clip names in [src/character.ts](src/character.ts). Each phase (`idle`, `thinking`, `tool`, `speaking`, `offline`) gets a looping clip. Reactions (`positive`, `negative`, `cognitive`) get one-shot emotes, layered additively.

The loader tries `character.glb`, then `placeholder.glb`, and finally falls back to a capsule.

**What the USD should contain:** a skinned mesh with at least `idle`, `talk` and `think` clips, plus a few emotes. A head bone matching `/head$/i` lets speech nod along with the token stream. Viseme blendshapes are optional and only matter once there's a TTS voice to sync them to.
