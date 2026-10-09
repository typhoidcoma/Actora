# Actora

A touch-first web client for the [Aelora](https://github.com/luminora-app/Aelora) agent backend. One screen: a 2×2 grid of
live tiles (**Tasks · Goals · Calendar · Inbox**) around a WebGL orb that is Wendy. Tap a tile and it morphs into its
detail view. Tap the orb and it opens a chat panel. It's designed for iPad first and scales down to phones. It installs to the home screen as a PWA.

## Stack

|           |                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------- |
| Framework | React 19 + TypeScript, Vite                                                                         |
| Motion    | [Motion](https://motion.dev) (`motion/react`): shared-layout morphs, springs, gestures              |
| Styling   | Tailwind CSS v4 with tokens from the Luminora house palette                                         |
| State     | Zustand stores fed by the WebSocket (data is pushed, not fetched)                                   |
| Orb       | [OGL](https://github.com/oframe/ogl) fragment shader, with a CSS fallback when WebGL is unavailable |
| Auth      | Supabase Google OAuth (the same project Aelora verifies JWTs against)                               |
| Tooling   | Vitest, oxlint, Prettier, vite-plugin-pwa                                                           |

## Run it

```bash
npm install
npm run dev          # mock mode by default: no backend or login needed
```

With no `VITE_AELORA_BASE_URL` set, the app runs against an **in-browser mock** of Aelora (`src/aelora/mock.ts`). The mock
speaks the real protocol: streaming chat, tool progress, emotion events, broadcast echoes and a notification drip.

To connect to a real backend, copy `.env.example` to `.env.local`:

```bash
VITE_AELORA_BASE_URL=https://your-aelora-host
VITE_AELORA_MOCK=0
```

`npm run dev` binds to your LAN (`server.host: true`), so you can open `http://<your-ip>:5173` on an iPad on the same
network.

| Script                    |                                                                 |
| ------------------------- | --------------------------------------------------------------- |
| `npm run dev`             | Dev server with HMR                                             |
| `npm run build`           | Typecheck + production build (`dist/`, includes service worker) |
| `npm test`                | Unit tests (protocol, sync, chat state machine)                 |
| `npm run lint` / `format` | oxlint / Prettier                                               |
| `npm run icons`           | Regenerate PWA icons                                            |

## Backend setup checklist

Two one-time settings on the backend side:

1. **CORS.** Add every origin you serve from to Aelora's `AELORA_CORS_ORIGINS`, for example `http://localhost:5173` and
   your production URL. Use exact strings with no trailing slash. The variable _replaces_ the defaults rather than adding
   to them, and a production deploy has no localhost defaults.
2. **Google sign-in.** In Supabase, go to **Auth → Providers → Google**. Enable it with a Google Cloud OAuth client. Then
   under **Auth → URL Configuration**, add `http://localhost:5173` and your production URL to the Redirect URLs.

Supabase's URL and anon key are read from Aelora's `GET /api/public-config`. Set `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` only to override them.

## How it's built

```
src/
  aelora/        protocol layer: no React
    socket.ts      connection, close-code policy, backoff + jitter, app-level ping
    request.ts     request/reply by `type` (Aelora has no request ids): per-type queue + timeouts
    router.ts      every server frame → stores; post-`hello` bootstrap; agent_command handling
    chat.ts        chat turn state machine (streaming, tool retraction, system_chat isolation)
    client.ts      start/stop + user actions (optimistic complete / mark-read with rollback)
    mock.ts        in-browser Aelora
  stores/        zustand: entities (by id), agent (orb + chat), ui (focus), metrics (geometry)
  ui/            Stage, Grid + tiles, OrbDock + shader, ChatSheet, Header
  auth/          Supabase client + Google sign-in screen
```

Protocol rules from Aelora's `FRONTEND.md` that the code depends on:

- **The JWT is pinned at connect time.** The socket reconnects on Supabase `TOKEN_REFRESHED`. Close `4001` is fatal,
  `1008` triggers one session refresh, and `1013` backs off slowly.
- **Replies are matched by `type`.** Requests with the same reply type never overlap, and every request times out.
- **Broadcasts echo to the sender.** All writes upsert by id, and a stale `updated_at` never overwrites a newer row.
- **Streamed tokens can be retracted** (`mindmap` → `tool:working`), so the bubble clears. `done.text` is
  authoritative.
- **`client_state`** advertises `ui.availableActions` (`tile.focus`, `tile.close`, `chat.open`, `chat.close`) and the
  orb's reaction states. That lets Wendy open a tile or the chat herself, and lets `avatar.react` beats play on the orb.

### Liquid glass and weather

- Surfaces use real backdrop blur and saturation over a tinted body, with a specular edge, a faint chromatic fringe and
  a sheen that follows the finger (`src/ui/sheen.ts`, registered `@property` values so it glides). Tiles squish
  and rebound on press. The orb's mood colour glows through the glass from behind the grid (`MoodLight`).
- The background is random on every load and coloured by the **local weather**
  (`src/weather/`). That means one browser location prompt and Open-Meteo's free forecast API: coordinates rounded to
  about 1 km, refreshed every 20 minutes, cached in `localStorage`. Each of seven skies has a day and a night palette,
  hot and cold temperatures tint it, and storms flash. If location is denied, it falls back to a clear day or night sky
  based on the local time.

### Motion and performance

- Geometry is computed once in `stores/metrics.ts` and mirrored to CSS variables. Every animation is a transform
  between known boxes, so nothing animates `width`, `height` or `top`.
- The orb is a single persistent element that glides between the grid centre, the focused tile's header and the chat
  header. Its WebGL context is created once. Its uniforms are eased every frame from the agent state: idle, thinking,
  speaking (per-token energy), tool (orbit ring), offline (desaturated), plus mood colours and reaction beats. It pauses
  when the tab is hidden and caps DPR at 2.
- Backdrop blur is limited to the few glass surfaces, and the ambient field behind them is pre-blurred and animated
  only with transforms.
- Supabase and the Markdown renderer are code-split. The initial JS is about 146 KB gzipped.
- `prefers-reduced-motion` is respected throughout.
