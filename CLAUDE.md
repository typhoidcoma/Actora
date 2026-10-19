# Actora: agent guide

Actora is a touch-first personal assistant on the Aelora agent backend (`H:\Projects\Aelora`). The agent is Wendy today;
her name comes from the server (`agentName()`, never hard-coded). Two front ends share one brain:

- **2D** (`src/`): React 19 + TypeScript + Vite + Tailwind v4 + Zustand. iPad first, down to 360 px phones.
- **3D** (`3dapp/`, served at `/3d/`): the same app around an animated character in a WebGPU room. It imports `src/`
  through `@actora/*` and replaces only the drawing. See `3dapp/CLAUDE.md`.

A change in `src/` changes both apps. Check both.

## Hard rules

1. **Graphics are WebGPU + TSL only.** `three/webgpu` and `three/tsl`, node materials, no WebGL, no GLSL, no raw WGSL,
   no other GPU library, no WebGL fallback. A guard blocks violations at edit time, in lint and in both builds. Read
   [docs/agents/graphics.md](docs/agents/graphics.md) before touching anything drawn.
2. **Reading beats animation.** Her words show the moment they arrive. No walk, camera move, pose or transition ever
   holds text back.
3. **Nothing from People reaches her unless the user asks.** Counts and names only; never message text. Don't add
   People data to `client_state`, prompts, `/api/llm` calls or the priority list.
4. **Advertise every ui_action, validate every argument.** Aelora runs only advertised actions and passes arguments
   through unchecked.
5. **Nothing requires typing.** Every screen has pills; the mic is one tap away.
6. **Design for 360 px.** No sideways scroll on a Samsung S22. The phone keyboard is not a layout change.
7. **Comments say why, in plain user words** ("she", "her line", "the cards"). Match the surrounding code.

The full list with reasons: [docs/principles.md](docs/principles.md). When a change would break one, the rule wins
unless the user changes the rule.

## Commands

| Where    | Command                                   | What                                                    |
| -------- | ----------------------------------------- | ------------------------------------------------------- |
| root     | `npm run dev`                             | 2D on 5173 (mock backend unless `VITE_AELORA_BASE_URL`) |
| root     | `npx tsc -b`                              | Typecheck (the build's own check)                       |
| root     | `npm run lint`                            | oxlint + graphics guard                                 |
| root     | `npm test`                                | Vitest (node environment, `src/**/*.test.ts`)           |
| root     | `npm run guard`                           | Graphics guard alone                                    |
| root     | `npm run build`                           | Guard, typecheck, build                                 |
| `3dapp/` | `npm run dev`                             | 3D on 5173 (one app at a time on 5173)                  |
| `3dapp/` | `npm run typecheck`                       | Also checks the `../src` it imports                     |
| either   | `VITE_AELORA_MOCK=1 npx vite --port 5175` | A mock copy on a spare port (the user often has 5173)   |

### Checks before calling anything done

```sh
npx tsc -b && npm run lint && npm test
cd 3dapp && npm run typecheck        # whenever src/ or 3dapp/ changed
```

Then **look at it**. Passing builds miss real UI bugs. Run the change headless against a mock server (Edge or Chrome
for Testing with the WebGPU flags; see [docs/agents/testing.md](docs/agents/testing.md)), screenshot day, dusk and a
360 px phone, and for 3D compare against 2D.

## Shipping

- **Actora:** verified changes go to `main`, which deploys (Cloud Build → Cloud Run). After pushing, confirm the
  Cloud Build succeeded; a red build means nothing shipped.
- **Aelora:** always a branch and a PR, never its `main`. The agent's playbook lives there
  (`persona/_clients/actora.md`); `docs/agent-ui.md` is our copy. Change both together.

## Feature guides

Task-focused guides for agents: where the code is, how to change it, what must not break, how to check it. The
`docs/*.md` files beside them are the full reference.

| Feature                                     | Guide                                                    | Reference                               |
| ------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Graphics (WebGPU, TSL, the orb)             | [graphics.md](docs/agents/graphics.md)                   |                                         |
| Chat, turns, her line                       | [chat.md](docs/agents/chat.md)                           | [architecture.md](docs/architecture.md) |
| Her screen actions and `client_state`       | [ui-actions.md](docs/agents/ui-actions.md)               | [agent-ui.md](docs/agent-ui.md)         |
| Home cards, priorities, box 4               | [home-cards.md](docs/agents/home-cards.md)               | [home-screen.md](docs/home-screen.md)   |
| Pills (options)                             | [pills.md](docs/agents/pills.md)                         | [home-screen.md](docs/home-screen.md)   |
| People: friends, DMs, her receptionist      | [people.md](docs/agents/people.md)                       | [social.md](docs/social.md)             |
| Sign-in, Google, push reminders             | [accounts-and-push.md](docs/agents/accounts-and-push.md) | [services.md](docs/services.md)         |
| Look: theme, colours, weather, sound, voice | [look-and-feel.md](docs/agents/look-and-feel.md)         | [services.md](docs/services.md)         |
| Check-ins, Vault, focus sessions, captures  | [assistant-extras.md](docs/agents/assistant-extras.md)   | [services.md](docs/services.md)         |
| Phone layout and metrics                    | [layout.md](docs/agents/layout.md)                       | [services.md](docs/services.md)         |
| 3D scene: room, light, panels, overlay      | [3d-scene.md](docs/agents/3d-scene.md)                   | [3dapp/README.md](3dapp/README.md)      |
| 3D character: animation, poses, models      | [3d-character.md](docs/agents/3d-character.md)           | [3dapp/README.md](3dapp/README.md)      |
| Mock backend, tests, headless checks        | [testing.md](docs/agents/testing.md)                     | [development.md](docs/development.md)   |

## Map

```
src/aelora/    socket, request(), router (frames → stores, runUiAction), chat state machine, mock backend
src/stores/    zustand: a useX hook + a lowercase action object per store (useUi/ui, useEntities/entities, ...)
src/options/   pills: local, generated (/api/llm), pushed; say() and runOption()
src/priority/  card scoring and her re-rank
src/ui/        2D components (Stage, Grid, cards/, people/, tiles/, orb/)
src/social/    People protocol      src/push/  Web Push      src/color/  OKLCH scheme engine
3dapp/src/     scene/ (WebGPU drawing), look/ (3D timing + layout), bridge/ (agent state → animation), dom/ (overlay)
scripts/       graphics guard, icon generation
```

Data flows one way: socket frame → `routeFrame` (`src/aelora/router.ts`) → store action → React hook. Protocol code
calls store action objects, not `setState` with ad-hoc shapes.

## Gotchas

- **Path case on Windows.** Run from `H:\Projects\Actora` / `/H/Projects/Actora` exactly. Another case gives duplicate
  modules and "no tests found".
- **Git Bash rewrites `/3d/`** into a Windows path. Prefix with `MSYS_NO_PATHCONV=1`.
- **PowerShell 5.1 has no `&&`.** Use `;` or Git Bash.
- **Don't edit code with `sed`.** Template literals and `$` get mangled; use the editor tools.
- **Stores are module singletons.** Reset them in `beforeEach`. Shared code guards `window` / `document` (tests run in
  node).
- **`docs/architecture.md` can lag the code.** The code wins (e.g. the chat turn backstop is 250 s, `TURN_TIMEOUT_MS`).
