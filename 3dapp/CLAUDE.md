# Actora 3D: agent guide

Read the root [CLAUDE.md](../CLAUDE.md) first; everything there applies here. This is the 3D client: three.js
`WebGPURenderer` + React Three Fiber v9, running the 2D app's brain from `../src` (imported as `@actora/*`).

## Rules specific to 3D

1. **WebGPU + TSL only, enforced.** `three/webgpu` and `three/tsl`, node materials, `RenderPipeline` for post. No
   WebGL renderer, no GLSL, no `ShaderMaterial`, no `@react-three/postprocessing`, no fallback. The hook in
   `.claude/settings.json` blocks violations as you write them; `npm run build` refuses them. How to write it:
   [docs/agents/graphics.md](../docs/agents/graphics.md).
2. **Text first.** No walk, camera move, pose or intro ever delays her words or the chat opening.
3. **Share, don't fork.** Logic lives in `../src`. If 3D must behave differently, add a switch there
   (`sayPolicy.openChatForLargeQuestions`), and keep the 2D and 3D `useSlots` in step.
4. **The scene imports no DOM UI.** `scene/`, `look/`, `bridge/` take only stores, protocol and pure helpers; the 2D
   React components are mounted from `dom/Overlay.tsx` only.
5. **One copy of each store.** `vite.config.ts` dedupes `react`, `react-dom`, `zustand`, `three`, `motion`, and
   `tsconfig.json` maps their types. Add a shared runtime dependency to both lists, or the socket will fill one store
   and the scene will read another.
6. **Compare with 2D.** Every visible change is screenshotted headless (day, dusk, phone) beside the 2D app.

## Commands

```sh
npm install            # here and at the repo root (../src resolves its deps from there)
npm run placeholder    # the stand-in character; not in git
npm run dev            # 5173, or: VITE_AELORA_MOCK=1 npx vite --port 5176
npm run typecheck      # also checks the ../src it imports
npm run build          # graphics guard, typecheck, build (base /3d/)
```

No lint or tests here: root `npm run lint` covers the guard, and shared logic is tested at the root.

## Guides

- [3d-scene.md](../docs/agents/3d-scene.md): room, light, shadows, post, cards in glass, the overlay.
- [3d-character.md](../docs/agents/3d-character.md): clips, poses, wander, her model.
- [graphics.md](../docs/agents/graphics.md): TSL patterns from this codebase.
- [testing.md](../docs/agents/testing.md): headless WebGPU screenshots, dev hooks (`__actora`, `__actora3d`).
