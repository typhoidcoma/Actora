# Graphics: WebGPU and TSL only

**No exceptions.** Everything Actora draws on the GPU runs on WebGPU, and every shader is written in TSL (three.js
Shading Language, `three/tsl`). That covers the 2D app (her orb), the 3D app (the whole scene) and anything added
later. Without hardware WebGPU the app says so or shows a CSS stand-in. It never falls back to WebGL or a software
adapter.

| Use                                                                                                                                        | Never                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import * as THREE from 'three/webgpu'`                                                                                                    | `import ... from 'three'` (bare: its default build is the WebGL renderer)                                                                          |
| `import { uniform, mix, Fn, ... } from 'three/tsl'`                                                                                        | GLSL in any form: `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `ShaderChunk`, `/* glsl */` strings, `.glsl` / `.vert` / `.frag` files |
| Node materials (`MeshBasicNodeMaterial`, `MeshStandardNodeMaterial`, `NodeMaterial`) with `colorNode`, `emissiveNode`, `fragmentNode`, ... | `WebGLRenderer`, `WebGLRenderTarget`, `getContext('webgl' \| 'webgl2')`, `WebGL2RenderingContext`                                                  |
| `THREE.WebGPURenderer` with three's WebGL2 fallback switched off                                                                           | `forceWebGL`, or leaving three free to drop to WebGL2 when WebGPU won't start                                                                      |
| `THREE.RenderPipeline` with TSL passes (`pass`, `depthPass`, `three/addons/tsl/display/*`)                                                 | `postprocessing`, `@react-three/postprocessing`, `three/addons/postprocessing/*`, `three/addons/shaders/*`                                         |
| Compute as TSL: `Fn(...).compute(n)`                                                                                                       | Raw shader strings: `wgslFn`, `glslFn`, `device.createShaderModule`                                                                                |
| `three/addons` loaders, `CSS3DRenderer`, `three/addons/tsl/**`                                                                             | Other GPU libraries: OGL, regl, twgl, PixiJS, Babylon, PlayCanvas, `three-custom-shader-material`                                                  |
| Canvas 2D (`getContext('2d')`) to paint a texture (`3dapp/src/look/paint.ts`)                                                              | A second renderer, or a "simple WebGL version" for devices without WebGPU                                                                          |

## How it's enforced

`scripts/graphics-guard.mjs` checks for everything in the right-hand column.

- **Builds.** Both `npm run build` scripts run it first, so a violation fails Cloud Build and can't deploy.
- **Lint.** `npm run lint` runs it; `npm run guard` runs it alone.
- **Claude Code.** `.claude/settings.json` runs it as a `PreToolUse` hook on `Write`, `Edit` and `MultiEdit`. An edit
  that adds WebGL, GLSL or raw WGSL under `src/` or `3dapp/` is blocked before it's written.

If the guard stops you, write it in TSL. Don't loosen the guard to get past it.

## Getting a WebGPU device

`webgpuReady()` in `src/gpu.ts` is the one check: a hardware adapter, not a software (fallback) one. Then the renderer:

```ts
const renderer = new THREE.WebGPURenderer({ alpha: true, powerPreference })
// three quietly drops to its WebGL2 backend if WebGPU won't start; we'd rather say so.
;(renderer as unknown as { _getFallback: null })._getFallback = null
await renderer.init()
if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) throw new Error('not WebGPU')
```

- **3D:** `3dapp/src/main.tsx` checks before mounting (`NoWebGPU.tsx` otherwise). R3F's `<Canvas>` makes a
  `WebGLRenderer` unless handed one, so `3dapp/src/scene/World.tsx` builds the `WebGPURenderer` in its `gl` prop and
  calls `webgpuFailed()` if the backend isn't WebGPU. A new `<Canvas>` must do the same (the guard checks).
- **2D orb:** `src/ui/orb/Orb.tsx` shows the CSS orb (`OrbFallback.tsx`) until the WebGPU one has drawn its first
  frame, then fades it in. Without WebGPU the CSS orb stays. three is imported lazily (`gpuOrb.ts`), so it isn't in
  the first paint. Keep it that way: never import `three/webgpu` from a module the 2D app loads up front.

## Writing TSL here

TSL builds the shader as a graph of nodes in TypeScript; three compiles it to WGSL. Every pattern below has a working
example in the repo.

### A material

Make it once (`useMemo`), give it nodes, dispose of it on unmount. From `3dapp/src/scene/Sky.tsx`:

```ts
const u = useMemo(() => ({ bg: uniform(new THREE.Color()), low: uniform(new THREE.Color()) }), [])
const material = useMemo(() => {
  const dir = normalize(positionLocal)
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
  m.colorNode = vec3(mix(u.low, u.bg, smoothstep(-0.35, 0.25, dir.y)))
  return m
}, [u])
useEffect(() => () => material.dispose(), [material])
```

### Animate uniforms, never rebuild

Set `.value` on a `uniform()` each frame. Rebuilding a material recompiles its pipeline and stutters.

```ts
useFrame((_, dt) => {
  u.bg.value.lerp(target, 1 - Math.exp(-dt * 2.2))
})
```

### Lit materials

Start from `MeshStandardNodeMaterial` and replace only what you need (`colorNode`, `emissiveNode`, `roughnessNode`), so
lights, shadows and AO keep working. `3dapp/src/look/skin.ts` adds a fresnel rim that way.

### A full-screen shader

`src/ui/orb/shader.ts` + `gpuOrb.ts`: a `NodeMaterial` whose `fragmentNode` is a TSL `Fn`, drawn with
`THREE.QuadMesh`. Points to copy:

- `screenUV` has its origin at the **top left**; flip y (`screenUV.y.oneMinus()`) for maths written y-up.
- `screenCoordinate` is the pixel position (GLSL's `gl_FragCoord`).
- `fragmentNode` output still goes through the renderer's colour transform. For values that are already final, set
  `renderer.outputColorSpace = THREE.LinearSRGBColorSpace` and `renderer.toneMapping = THREE.NoToneMapping`.
- `await renderer.compileAsync(quad, quad.camera)` before the first frame, so nothing hitches in.

### Functions, branches and loops

- `Fn(([a, b]) => ...).setLayout({ name, type, inputs })` emits a real WGSL function. Use it for helpers called
  more than once (the orb's `hash`, `noise`, `fbm`, `vivid`). Without `setLayout` a `Fn` is inlined at every call.
- `If`, `select`, `Loop` and `.toVar()` / `.assign()` for state. `3dapp/src/scene/room/pcss.ts` (contact-hardening
  soft shadows) is the reference for loops.
- Typing parameters: `THREE.Node<'vec3'>`, `THREE.Node<'float'>`. `ReturnType<typeof vec3>` is too narrow.

### Glass and screen-space effects

`viewportSharedTexture()` is the frame drawn so far. `3dapp/src/scene/panels/Pane.tsx` blurs it with `hashBlur`
(`three/addons/tsl/display/`) for the frosted card glass.

### Post-processing

One `THREE.RenderPipeline` owns rendering (`3dapp/src/scene/Post.tsx`, `useFrame` priority 1): `pass()`,
`depthPass()` and TSL display nodes (`ao`, `bloom`, `dof`) into `pipeline.outputNode`, then `pipeline.render()` each
frame. Add an effect to that graph, never as a second pipeline.

## Before you call it done

1. `npm run guard`, plus the checks in `CLAUDE.md`.
2. **Look at it.** TSL type-checks and still fails at pipeline creation; WGSL errors only show in the browser console.
   Run it headless with the WebGPU flags (`docs/development.md`, "Verifying the UI headlessly") and read the console
   as well as the screenshot. Day, dusk, and a 360 px phone.
3. For a port or a change to an existing look, screenshot before and after (a worktree of `main` on a spare port).
4. Keep it cheap. It runs on iPads and phones: fewer samples, half-resolution passes (`resolutionScale = 0.5`),
   `powerPreference: 'low-power'` for small things like the orb, textures painted once rather than per frame.
