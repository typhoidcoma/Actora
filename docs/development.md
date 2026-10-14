# Development

How to run, test, check and ship Actora. For developers and coding agents working in this repo.

- `src/`: the 2D app (React 19, TypeScript, Vite, Tailwind v4, Zustand).
- `3dapp/`: the 3D app (three.js `WebGPURenderer` + React Three Fiber). It reuses `src/` through the `@actora/*`
  alias, so the socket, stores, router and options are the same code in both. See `3dapp/README.md`.
- Backend: [Aelora](https://github.com/luminora-app/Aelora) (`H:\Projects\Aelora` locally). The agent is Wendy; her
  name comes from the server.

## Prerequisites

- Node 20 or newer (`engines` in both `package.json` files; the Docker build uses Node 22).
- npm (both apps have a `package-lock.json`; use `npm ci` for a clean install).
- For 3D: a browser with hardware WebGPU (current Chrome, Edge or Safari). There is no WebGL fallback.
- Optional, for the 3D character pipeline: Blender on `PATH` (`npm run usd`).

## Install

The 3D app imports `../src`, whose own dependencies (Supabase, react-markdown, ...) resolve from the root
`node_modules`, so install both.

```sh
npm install                 # repo root: the 2D app
cd 3dapp
npm install                 # the 3D app
npm run placeholder         # stand-in character (three.js Xbot) into public/models/; not in git
```

## Environment

Both apps read the root `.env` / `.env.local` (`3dapp/vite.config.ts` sets `envDir: '..'`). Start from
`.env.example`. Values are read in `src/config.ts`.

| Variable                            | Meaning                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `VITE_AELORA_BASE_URL`              | Aelora HTTP origin, no trailing slash. The WebSocket is `<origin>/ws` (`ws`/`wss`). |
| `VITE_AELORA_MOCK`                  | `1` = in-browser mock backend (`src/aelora/mock.ts`): no login, seeded data.        |
| `VITE_SUPABASE_URL`, `..._ANON_KEY` | Optional. Otherwise read at runtime from Aelora's `GET /api/public-config`.         |
| `VITE_SUPABASE_AUTH_REDIRECT_URL`   | Optional. Where Google sends you back; must be an allowed Supabase redirect URL.    |
| `VITE_CHARACTER_URL`                | 3D only. Her model (e.g. `/models/character.glb`); unset means the stand-in.        |

Mock mode is on when `VITE_AELORA_MOCK=1` **or** `VITE_AELORA_BASE_URL` is empty. To use a real backend, set
`VITE_AELORA_BASE_URL` and `VITE_AELORA_MOCK=0` (or remove it).

## Run

```sh
npm run dev                 # 2D: http://localhost:5173
cd 3dapp && npm run dev     # 3D: http://localhost:5173 (dev serves it at /, not /3d/)
```

- Both pin port **5173** with `strictPort`, because Supabase/Google only redirect back to `http://localhost:5173`.
  Run one app at a time on that port. If 5173 is busy, the server fails instead of moving.
- Both bind to the LAN (`host: true`), so an iPad on the same Wi-Fi can open `http://<your-ip>:5173`.
- The 3D build uses base `/3d/`; dev uses `/`. The 3D dev server also serves the root `public/` files (`/sw.js`,
  icons, fonts) so the shared push code works.
- Mock copies on spare ports, for side-by-side checks while the real one runs on 5173 (sign-in won't work there):

```sh
VITE_AELORA_MOCK=1 npx vite --port 5175                 # 2D, at the root
cd 3dapp && VITE_AELORA_MOCK=1 npx vite --port 5176     # 3D
```

## Scripts

Root (2D):

| Script              | What it does                                                |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                                    |
| `npm run build`     | `tsc -b && vite build` into `dist/`                         |
| `npm run preview`   | Serve the build on 5173                                     |
| `npm run typecheck` | `tsc -b`                                                    |
| `npm run lint`      | oxlint (`.oxlintrc.json`; ignores `3dapp/**`)               |
| `npm test`          | `vitest run`                                                |
| `npm run format`    | Prettier, writes in place (`.prettierignore` skips `3dapp`) |
| `npm run icons`     | `scripts/gen-icons.mjs`: app icons and notification badge   |

`3dapp/`:

| Script                      | What it does                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `npm run dev`               | Vite dev server on 5173                                       |
| `npm run build`             | `tsc --noEmit && vite build` into `3dapp/dist/` (base `/3d/`) |
| `npm run preview`           | Serve the build on 5173                                       |
| `npm run typecheck`         | `tsc --noEmit` (also checks the `../src` it imports)          |
| `npm run placeholder`       | Fetch and compress the Xbot stand-in (`--force` to refetch)   |
| `npm run usd -- <in> <out>` | USD to GLB through Blender (`scripts/usd-to-glb.py`)          |

The 3D app has no lint, test or format script of its own. A change to `src/` affects both apps: run the root checks
and `cd 3dapp && npm run typecheck`.

Before pushing, at minimum:

```sh
npm run typecheck && npm run lint && npm test
cd 3dapp && npm run typecheck     # when src/ or 3dapp/ changed
```

## Tests

- Vitest, `environment: 'node'` (root `vite.config.ts`). No DOM: tests cover the framework-free code.
- Tests live next to their code as `src/**/*.test.ts` (e.g. `src/aelora/request.test.ts`,
  `src/stores/pending.test.ts`, `src/priority/priority.test.ts`). Only that glob runs; `3dapp` has no tests.
- Patterns:
  - **Fake `FrameBus`** (`src/aelora/socket.ts`): a bus whose frames the test pushes by hand, cast with
    `as unknown as FrameBus`. See `fakeBus()` in `src/aelora/request.test.ts`.
  - **Browser globals** with `vi.stubGlobal`: `window`, `localStorage`, `fetch`, `createImageBitmap`
    (see `src/google/google.test.ts`, `src/ui/peek.test.ts`, `src/social/pictures.test.ts`).
    Undo with `vi.unstubAllGlobals()`.
  - Zustand stores are plain modules: set state with `useX.setState(...)`, read with `useX.getState()`.

```sh
npm test                                  # all
npx vitest run src/aelora/request.test.ts # one file
npx vitest                                # watch
```

**Windows tip.** If module resolution complains (duplicate modules, "cannot find module" for a file that exists),
check the case of the drive letter and path. Run from the canonical-case path, e.g. `/H/Projects/Actora` in Git Bash
or `H:\Projects\Actora`, not `h:\projects\actora`.

## Verifying the UI headlessly

Build and tests passing is not enough for UI work; real runtime bugs (shader failures, text drawn under glass, clipped
textures) only show on screen. Check every visual change, and for 3D compare it with the 2D app (day, dusk, phone).

Setup, in a scratch folder outside the repo:

```sh
npm i puppeteer-core
npx @puppeteer/browsers install chrome@stable --path ./cft     # Chrome for Testing
```

Launch with a fresh profile:

```js
const browser = await puppeteer.launch({
  executablePath: '<path from the install>',
  headless: 'new',
  userDataDir: './profile',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--ignore-gpu-blocklist'], // 3D needs these
})
const page = await browser.newPage()
page.on('console', (m) => console.log(m.type(), m.text())) // WGSL / pipeline errors show here
await page.setViewport({ width: 1366, height: 1024 })
await page.goto('http://localhost:5176/')
await new Promise((r) => setTimeout(r, 14_000)) // 3D: let the scene load and settle
await page.screenshot({ path: 'home.png' })
```

- Run against a mock server (see Run). Wait ~14 s for the 3D scene; the 2D app is ready in a second or two.
- Force the theme with `localStorage['actora.theme.v1'] = 'day' | 'dusk'` (via `evaluateOnNewDocument`).
- To test the no-WebGPU screen, stub `navigator.gpu` or `GPUAdapter.prototype.requestDevice` in
  `evaluateOnNewDocument`.
- Microsoft Edge (`msedge.exe`) with the same flags also works when it is installed and not mid-update.

### Dev hooks (dev builds only)

`window.__actora`, set in `src/main.tsx` (2D) and `3dapp/src/main.tsx` (3D):

| Hook                      | App  | Use                                                                    |
| ------------------------- | ---- | ---------------------------------------------------------------------- |
| `ui(name, args)`          | both | Run a ui_action, e.g. `__actora.ui('colors.set', { seed: '#7a5ad6' })` |
| `chat(text)`              | both | Send a turn as if tapped, e.g. `__actora.chat('plan my day')`          |
| `event(event, data)`      | 2D   | Feed a server event into the router                                    |
| `agent`, `ask`, `checkin` | 2D   | The agent store; a raw socket request; a check-in now                  |
| `open`                    | 3D   | The `ui` actions object, e.g. `__actora.open.openChat()`               |
| `colors(input \| null)`   | 3D   | Set the colour scheme; `null` restores the brand                       |
| `stores`                  | 3D   | `{ agent, entities, ui }` Zustand hooks: `getState()` / `setState()`   |

`window.__actora3d` (3D, read each frame; set it yourself):

- `busy = true`: she wanders as if a turn were running (`3dapp/src/scene/Character.tsx`).
- `hold: 'think' | 'phone'`, `gesture: 'wave'`, `poses: {...}`, `at`, `turn`: try poses, gestures and the phone's
  placement live (`3dapp/src/bridge/agentAnim.ts`).

### Injecting state from a store module

For a store the hooks don't expose, import the module from the dev server. Vite serves the same instance the app
uses, so writes show up at once:

```js
// 2D: files under the app root
const { usePending } = await import('/src/stores/pending.ts')
// 3D: ../src is outside 3dapp, so use its /@fs/ URL
const { useEntities } = await import('/@fs/H:/Projects/Actora/src/stores/entities.ts')
useEntities.setState({/* ... */})
```

Use the exact path the app itself imports (same drive-letter case), or you get a second copy of the store.

## Deploy

- One Cloud Run service, built from the root `Dockerfile`. Continuous deployment (a Cloud Build trigger on `main`)
  builds and deploys every push to `main`. There is no CI config in this repo.
- Build stage (`node:22-alpine`): `npm ci` at the root, then `npm ci && npm run placeholder` in `3dapp` (the stand-in
  character is not in git), then `npm run build` (2D into `dist/`) and `cd 3dapp && npm run build` (into
  `3dapp/dist/`).
- Serve stage (`nginx:1.27-alpine`): `dist/` at the site root, `3dapp/dist/` at `/3d/`. Same origin, so the 3D app
  shares sign-in, session and Aelora CORS. `deploy/nginx.conf.template` gets `${PORT}` filled in at start (8080 by
  default).
- Caching: hashed `/assets/` and `/3d/assets/` for a year; `/3d/models/` for a day; `index.html`, `/3d/index.html`,
  `/sw.js` and the manifest are `no-cache`. `/3d/` falls back to `/3d/index.html`; a missing `/sw.js` 404s.
- Build args: `VITE_AELORA_BASE_URL` (defaults to the current Aelora Cloud Run URL; override if the backend moves),
  optional `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The image sets `VITE_AELORA_MOCK=0`. `.env` files never
  enter the image (`.dockerignore`).

```sh
docker build --build-arg VITE_AELORA_BASE_URL=https://<aelora-host> -t actora .
docker run -p 8080:8080 actora      # 2D at /, 3D at /3d/
```

## Backend checklist

Outside this repo, for every origin Actora is served from (production URL, `http://localhost:5173`):

1. **CORS.** Add it to Aelora's `AELORA_CORS_ORIGINS` (exact strings). The variable replaces the defaults, so keep the
   existing ones. Without it the browser blocks `/api/public-config` (sign-in can't start) and `/api/llm` (options,
   card ranking).
2. **Supabase.** Enable Auth → Providers → Google, and add the origin under Auth → URL Configuration → Redirect URLs.
   Google's own OAuth settings don't change.
3. **Push (optional).** Aelora serves the VAPID public key in `GET /api/public-config` as `push.publicKey`. It is
   `null` unless both VAPID keys are set (including `AELORA_VAPID_PRIVATE_KEY`); then the reminder offer never appears.
4. **Hosting.** `/sw.js` from the site root with `Cache-Control: no-cache` (already in the nginx template).

The 3D app at `/3d/` needs nothing extra: same origin as the 2D app.

## Working with Aelora

- Aelora changes go on a branch with a PR, never straight to Aelora's `main`. (Actora itself is pushed to `main`, which
  deploys.)
- Wire protocol: Aelora's `FRONTEND.md`. Push: Aelora's `docs/PUSH.md`.
- Wendy's Actora playbook lives in Aelora at `persona/_clients/actora.md`, turned on when
  `client_state.ui.client` is `"actora"`. `docs/agent-ui.md` here is the reference copy: change both together.
- New ui_actions go in `AVAILABLE_ACTIONS` (`src/aelora/actions.ts`) and the router (`src/aelora/router.ts`), and
  in the playbook.

## Windows shell gotchas

- **Git Bash path conversion.** MSYS rewrites arguments that look like POSIX paths, so `/3d/` becomes
  `C:/Program Files/Git/3d/`. Prefix the command with `MSYS_NO_PATHCONV=1`:

  ```sh
  MSYS_NO_PATHCONV=1 node check.mjs /3d/
  ```

- **Editing code from the shell.** `sed` and shell quoting mangle `${}` template literals, `$` and backslashes. Use an
  editor or a small Node script (`fs.readFileSync` / `writeFileSync`) for code edits.
- **Path case.** See the tip under Tests: use `H:\Projects\Actora` / `/H/Projects/Actora`, matching case.
- PowerShell 5.1 has no `&&`; use `;` or `if ($?) { ... }`, or run the npm commands from Git Bash.
