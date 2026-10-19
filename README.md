# Actora

A touch-first personal assistant on the [Aelora](https://github.com/luminora-app/Aelora) agent backend. You talk with
your agent (Wendy today; the name comes from the server), she keeps your day in view, and she can drive the whole UI.

Actora has two front ends that share one brain:

- **The 2D app** (`src/`): one screen, designed for iPad first and scaling down to 360 px phones. It installs to the home
  screen.
- **The 3D app** (`3dapp/`, served at `/3d/`): the same app around an animated character in a WebGPU room. It reuses
  everything in `src/` except the DOM views.

## What's on the screen

- **Her line** over her head: her welcome, her thinking, the start of each reply, and reminders.
- **Four cards** in a 2×2 grid.
  - **Three priority cards**: what to tackle next, from any domain. These are events, tasks, reminders, goals and unread
    messages.
  - **Box 4**: fun finds she searched the web for, or "Waiting for your OK" while an email or invite she prepared needs
    approval.
- **The pills**: what you can say or do next, for whatever is on screen. Nothing requires typing.
- **The chat**: the full conversation, a closer view of the same turns her line shows.
- **Panels**: lists, items, the Vault (what she remembers), finds, and **People**. People has friends, direct messages,
  and an assistant mode that lets friends talk to your agent.

## Quick start

```bash
npm install
npm run dev          # 2D on http://localhost:5173, mock backend unless VITE_AELORA_BASE_URL is set

cd 3dapp
npm install
npm run dev          # 3D on http://localhost:5173 (run one app at a time), needs a WebGPU browser
```

With no `VITE_AELORA_BASE_URL`, or with `VITE_AELORA_MOCK=1`, both apps run against an in-browser mock of Aelora
(`src/aelora/mock.ts`, `src/aelora/mockSocial.ts`). That mock covers streaming chat, tools, reminders, finds and a whole
social graph. Put the real backend's URL in `.env.local` to use it.

| Script (root)       |                                                 |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | 2D dev server with HMR (binds to your LAN)      |
| `npm run build`     | Typecheck and production build                  |
| `npm run typecheck` | Typecheck only                                  |
| `npm test`          | Unit tests (Vitest)                             |
| `npm run lint`      | oxlint                                          |
| `npm run format`    | Prettier                                        |
| `npm run icons`     | Regenerate app icons and the notification badge |

## Docs

| Doc                                                  | Read it for                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [docs/principles.md](docs/principles.md)             | The rules behind the behaviour. Start here before changing how anything feels.                          |
| [docs/architecture.md](docs/architecture.md)         | How the code fits together: socket, router, stores, the mock, 2D and 3D.                                |
| [docs/home-screen.md](docs/home-screen.md)           | The cards, box 4, her line and the pills: where the data comes from and how it is ranked.               |
| [docs/social.md](docs/social.md)                     | People: profiles, pictures, friends, messages, assistant mode, privacy.                                 |
| [docs/services.md](docs/services.md)                 | Sign-in and Google, push reminders, sound, voice, theme and colour, check-ins, the Vault, phone layout. |
| [docs/agent-ui.md](docs/agent-ui.md)                 | The agent's playbook: every UI action she can call. Reference copy of the one on the server.            |
| [docs/development.md](docs/development.md)           | Running, testing, checking the UI headless, deploying, and working with Aelora.                         |
| [3dapp/README.md](3dapp/README.md)                   | The 3D app: WebGPU room, character, 3D-only behaviour.                                                  |
| [CLAUDE.md](CLAUDE.md), [docs/agents/](docs/agents/) | For coding agents: hard rules, commands, and a task guide per feature.                                  |

## Stack

|           |                                                                                         |
| --------- | --------------------------------------------------------------------------------------- |
| Framework | React 19 + TypeScript, Vite                                                             |
| Motion    | [Motion](https://motion.dev) (`motion/react`): shared-layout morphs, springs, gestures  |
| Styling   | Tailwind CSS v4 over themed CSS tokens (daylight / dusk), OKLCH colour engine           |
| State     | Zustand stores fed by the Aelora WebSocket (data is pushed, not fetched)                |
| Auth      | Supabase Google OAuth, which also connects Calendar and Gmail                           |
| Graphics  | WebGPU + TSL only: three.js `WebGPURenderer` (3D with React Three Fiber; the 2D orb)    |
| Type      | [Satoshi](https://www.fontshare.com/fonts/satoshi), self-hosted (ITF Free Font License) |
| Sound     | SND Sine kit (`public/sounds/sine/CREDITS.md`)                                          |
| Tooling   | Vitest, oxlint, Prettier                                                                |

## Deploy

Pushing to `main` deploys. Cloud Build builds the `Dockerfile`, which contains the 2D app at `/` and the 3D app at
`/3d/`, served by nginx on Cloud Run. Each new origin also needs adding to Aelora's CORS list and to Supabase's
redirect URLs. [docs/development.md](docs/development.md) has the details and the backend checklist.
