# Mock backend, tests and headless checks

Full reference: [development.md](../development.md) and [architecture.md](../architecture.md) ("The mock backend",
"Testing").

## The mock

`VITE_AELORA_MOCK=1` (or no `VITE_AELORA_BASE_URL`) swaps the socket for `MockWebSocket` (`src/aelora/mock.ts`). It
speaks real frames: hello, seeded tasks/goals/events/notifications, streaming replies with tools and moods, the
welcome, finds, sessions, the Vault, and People through `MockSocial` (`src/aelora/mockSocial.ts`). `/api/llm` callers
use `mockLlm`.

When you add a protocol feature, teach the mock too, so it can be seen without a backend.

## Unit tests

- Vitest in the **node** environment; tests sit next to their code as `src/**/*.test.ts`. No DOM, no jsdom.
- Drive protocol code with a fake `FrameBus` (`send` records, `subscribe` feeds frames): `fakeBus()` in
  `src/aelora/request.test.ts`.
- Browser globals: `vi.stubGlobal('window' | 'localStorage' | 'fetch' | ...)`, undone with `vi.unstubAllGlobals()`.
- Stores are singletons: reset with `useX.setState(...)` / `entities.reset()` in `beforeEach`.
- The 3D app has no tests; its shared logic is tested at the root.

## Looking at it (required for anything visible)

Builds and tests miss shader failures, text under glass and clipped textures. Every visible change gets looked at.

1. Run mock copies on spare ports (the user often has 5173): `VITE_AELORA_MOCK=1 npx vite --port 5175` at the root,
   and in `3dapp/` with `--port 5176`.
2. In a scratch folder outside the repo: `npm i puppeteer-core`. Use Edge
   (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`) or Chrome for Testing
   (`npx @puppeteer/browsers install chrome@stable`), `headless: 'new'`, its own `userDataDir`, and the WebGPU flags
   `--enable-unsafe-webgpu --enable-features=Vulkan,WebGPU --ignore-gpu-blocklist`.
3. Log console errors and warnings (WGSL and pipeline errors only show there). Wait ~2 s for 2D, ~14 s for 3D.
4. Force the theme with `localStorage['actora.theme.v1'] = 'day' | 'dusk'` in `evaluateOnNewDocument`.
5. Screenshot day, dusk and 360 px. For 3D, compare with 2D. For a change to an existing look, compare with `main`
   (`git worktree add <scratch>/before origin/main`, `npm ci`, run it on another port).
6. No-WebGPU path: `Object.defineProperty(navigator, 'gpu', { value: undefined })` in `evaluateOnNewDocument`.

Dev hooks for forcing states: `window.__actora` (`ui`, `chat`, `event`, `agent`, `ask`, `checkin` in 2D; `ui`,
`chat`, `open`, `colors`, `stores` in 3D) and `window.__actora3d` (`busy`, `hold`, `gesture`, `poses`).
