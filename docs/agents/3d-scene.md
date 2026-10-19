# 3D scene: room, light, panels, overlay

The 3D app draws the same home screen in a WebGPU room around her. All drawing follows
[graphics.md](graphics.md). Full reference: [3dapp/README.md](../../3dapp/README.md).

## Where things are

| What                                                         | File                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| WebGPU check, boot, no-WebGPU screen                         | `3dapp/src/gpu.ts` (uses `src/gpu.ts`), `main.tsx`, `NoWebGPU.tsx` |
| Canvas, renderer, camera rig                                 | `3dapp/src/scene/World.tsx`                                        |
| The atrium and its materials                                 | `scene/room/Room.tsx`, `room/materials.ts`                         |
| Sun, cove, mood tint, shadow maps                            | `scene/room/Lighting.tsx`                                          |
| Contact-hardening soft shadows (TSL)                         | `scene/room/pcss.ts`                                               |
| Sky dome (the 2D weather field)                              | `scene/Sky.tsx`                                                    |
| Render pipeline: AO, bloom, depth of field                   | `scene/Post.tsx`                                                   |
| Cards in WebGPU glass (shared surface: `Pane.tsx`)           | `scene/panels/*`                                                   |
| Painting card faces on canvas (type, wrap, glass tint)       | `look/paint.ts`, `look/fonts.ts`                                   |
| Colours from the shared scheme                               | `look/theme.ts` (`useLook`)                                        |
| Stage layout per aspect (her spot, the grid, phones)         | `look/layout.ts` (`useStage`)                                      |
| Focus mode (chat or panel open), camera in close             | `look/focus.ts`                                                    |
| DOM overlay: the 2D rail, chat, panels                       | `dom/Overlay.tsx`                                                  |
| DOM pinned to scene points; CSS3D focus panel                | `scene/Anchor.tsx`, `scene/FocusPanel3D.tsx`, `look/focusHost.ts`  |
| Readiness (model, fonts, env, compiled, data) and the loader | `look/ready.ts`, `dom/Loader.tsx`                                  |
| The UI layer (seen by camera and pointer, not by AO)         | `look/layers.ts` (`UI_LAYER`)                                      |

## Rules

- **Imports.** The scene (`scene/`, `look/`, `bridge/`) imports only framework-free shared code: stores, protocol,
  `color/scheme`, `weather/sky`, and pure helpers (`ui/format`, `ui/markdownText`, `ui/tiles/data`, `ui/palette`,
  `ui/brand`). 2D DOM components are used only from `dom/`.
- **Same rules as 2D.** Slots, ranking and pills come from `src/`. If the 2D `useSlots` changes, `Grid3D.tsx`'s does
  too. A shared behaviour that must differ gets a switch in `src/` (like `sayPolicy`), never a fork.
- **Light is the theming.** Theme, mood and alarms change the light (`Lighting.tsx`), not the materials' colours.
- **Floating UI is on `UI_LAYER`** so AO and the depth pass ignore it.
- **One render pipeline** (`Post.tsx`). New effects join that graph.
- **Phones:** the camera holds still and everything stacks below her head and shoulders (`layout.ts`). Touch devices
  get smaller shadow maps.
- **Dispose** every material, geometry and texture you create in `useMemo`.

## Check

`cd 3dapp && npm run typecheck`, `npm run guard` at the root, then headless with the WebGPU flags on a mock (port 5176),
~14 s settle, day / dusk / phone, compared with the 2D app ([testing.md](testing.md)). Read the console: WGSL
errors only show there.
