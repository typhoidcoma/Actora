# Actora

A touch-first web client for the [Aelora](https://github.com/luminora-app/Aelora) agent backend. The app shows one
screen:

- **Wendy's line** across the top: her welcome, the first sentence of each reply, and reminders.
- **The grid**: four 4:3 cards around an orb that is Wendy.
  - Three **priority cards**, ranked: the things to tackle next, from any domain.
  - **Box 4** (bottom-right), **For you**: fun finds Wendy searched the web for, picked for you. Images crossfade behind a big count of fun things you have not seen yet. Her full answers open in a reader, either automatically for big questions or by tapping her line.
- **The option rail** along the bottom: what you can say or do next.

**Nothing requires typing.** Tap the orb to talk, tap an option, or tap a card for its actions. Wendy can drive every
part of the UI; `docs/wendy-ui.md` is her playbook. Actora is designed for iPad first, scales down to phones, and
installs to the home screen.

## Priority cards (`src/priority/`)

1. **Local score** (`score.ts`). Each item gets an instant, deterministic score: a live or imminent event, an overdue
   task, a fresh unread reminder, a task due today, a goal falling behind. The top 3 can hold at most two of one kind.
2. **Wendy re-ranks** (`rank.ts`). She reorders the top 8 through `POST /api/llm`, grounded in your profile, and
   writes a short ✦ "why now" for each card. Debounced, cached by the candidate set, at most once every 2 minutes,
   429-aware.
3. **`priorities.set`**. Wendy can set the order herself. It holds for 30 minutes.

When an item is finished or read, its card drops out at once and the others glide up. If there are fewer than three
things to tackle, domain summaries fill the gaps. Tapping a card morphs it into its item panel. The full lists open
from the header buttons, from "See all", or when Wendy opens them.

## Stack

|           |                                                                                         |
| --------- | --------------------------------------------------------------------------------------- |
| Framework | React 19 + TypeScript, Vite                                                             |
| Motion    | [Motion](https://motion.dev) (`motion/react`): shared-layout morphs, springs, gestures  |
| Styling   | Tailwind CSS v4 over themed CSS tokens (daylight / dusk)                                |
| Type      | [Satoshi](https://www.fontshare.com/fonts/satoshi), self-hosted (ITF Free Font License) |
| State     | Zustand stores fed by the WebSocket (data is pushed, not fetched)                       |
| Orb       | [OGL](https://github.com/oframe/ogl) fragment shader, with a CSS fallback               |
| Auth      | Supabase Google OAuth (the same project Aelora verifies JWTs against)                   |
| Tooling   | Vitest, oxlint, Prettier                                                                |

## Run it

```bash
npm install
npm run dev          # mock mode unless VITE_AELORA_BASE_URL is set
```

With no `VITE_AELORA_BASE_URL`, or with `VITE_AELORA_MOCK=1`, the app runs against an **in-browser mock** of Aelora
(`src/aelora/mock.ts`). The mock supports streaming chat, the `system_chat` welcome, tool progress, emotion, broadcast
echoes, a reminder drip and canned option generation. To use a real backend, put `VITE_AELORA_BASE_URL` in `.env` or
`.env.local`. The dev server binds to your LAN, so an iPad on the same Wi-Fi can open `http://<your-ip>:5173`.

| Script                    |                                                         |
| ------------------------- | ------------------------------------------------------- |
| `npm run dev`             | Dev server with HMR                                     |
| `npm run build`           | Typecheck + production build                            |
| `npm test`                | Unit tests (protocol, sync, chat, options, push, voice) |
| `npm run lint` / `format` | oxlint / Prettier                                       |
| `npm run icons`           | Regenerate app icons and the notification badge         |

## Backend setup checklist

1. **CORS.** Add every origin you serve from to Aelora's `AELORA_CORS_ORIGINS`, using exact strings. The variable
   replaces the defaults rather than adding to them. `/api/llm`, which generates the options, needs this too.
2. **Google sign-in.** In Supabase, enable **Auth → Providers → Google**, and add your origins to **Auth → URL
   Configuration → Redirect URLs**.
3. **Push** (optional). Aelora must serve a VAPID key in `GET /api/public-config` (`push.publicKey`). When the key is
   `null`, the reminder offer never appears.
4. **Hosting.** Serve `/sw.js` from the site root with `Cache-Control: no-cache`.

## How it works

### Never typing: options everywhere (`src/options/`)

Every place in the app has a context key: `home`, `tile:<id>`, `item:<kind>:<id>` or `chat`. The rail always shows
options for that context, merged in this order:

1. **Local options** (`local.ts`): instant and deterministic, built from your data. They include **direct actions**
   that need no chat turn, such as _Done_, _Tomorrow_, _Got it_ and _Mark all read_.
2. **Wendy-written options** (`wendy.ts`): generated through Aelora's `POST /api/llm`. The request carries a summary of
   the screen with real item titles, the recent turns, and her last message, plus `context: {profile, memoryQuery}`.
   If her last message asks something, the options are answers to it. These refresh on every context change and every
   finished reply, and they are debounced, cached for 3 minutes, and back off on 429.
3. **Options pushed by Wendy** through the `options.set` ui_action. These win until you move to another context.

Tapping a _say_ option sends a chat turn, and Wendy answers in the line above the grid. The orb is the microphone: tap
it to talk, and its pulse follows the words as they come in. Hold it to open the full conversation. A chat button and a
tucked-away keyboard sit at the end of the rail.

### Wendy drives the UI (`src/aelora/router.ts`)

`client_state` advertises these ui_actions:

- `tile.focus` and `tile.close`
- `chat.open` and `chat.close`
- `item.focus {kind,id}`
- `options.set {options}`
- `reply.show` and `reply.hide`
- `theme.set {mode}`
- `voice.listen`
- `push.offer`

Alongside them it sends a `ui.screen` snapshot of what is on screen. That snapshot is ready for a persona that reads it.

### Wendy's line (`src/ui/WendyLine.tsx`, `src/aelora/greeting.ts`)

- **Welcome.** The welcome comes over `system_chat`, Aelora's path for app events (no history, mood or fact side
  effects). It is cached and regenerated only after 30 minutes away or when the part of the day changes.
- **Replies.** Off the chat screen, her replies stream into the line, and older lines fade up and out.
- **Reminders.** A reminder that arrives while the app is open appears in the line with answer chips, and stays there
  until you acknowledge it.

### Push reminders (`src/push/`, `public/sw.js`)

The setup follows Aelora's `docs/PUSH.md`:

- The service worker is a plain push transport, with no Workbox and no caching.
- Opting in is a single quiet chip, _Let Wendy remind me_, which only appears after Wendy has spoken.
  - On iOS in a Safari tab, the chip explains how to add the app to the Home Screen instead.
- The subscription is re-sent on every reconnect.
- Tapping a notification on the lock screen opens Inbox with that reminder selected and marks it read.
- The header menu holds the on/off toggle and **Send a test reminder** (`push.test`).

### Look

- **Palette.** Taken from the Wendy agent art (`src/ui/brand.ts`, mirrored as CSS tokens): periwinkle `#5A7BE6`, lime
  `#B4D03A`, hot pink `#F23D7B` and indigo ink `#1F2A6B` on cream paper `#F2EEE4`, plus violet, sky, blush and navy for
  emotion and weather range.
  - The semantic tokens are `accent` (periwinkle), `urgent` (pink) and `calm` (deep lime `#7E9A14`, readable on cream).
  - Priority heat runs pink, then periwinkle, then lime. Daylight is cream; dusk is deep indigo.
- **Shape.** Cards are exactly 4:3 with 12px corners.
- **Themes.**
  - **Daylight** is Hog Bristle and runs while the sun is up at your location (Open-Meteo sunrise/sunset).
  - **Dusk** is Midnight Affair and runs after sunset.
  - Changes cross-fade through registered CSS custom properties. You can override the theme in the menu, and Wendy can
    with `theme.set`.
- **Liquid glass.** Backdrop blur and saturation, a specular edge, a finger-tracking sheen, a rim around the notch, and
  a jelly press. The orb's mood colour spills through from behind the grid.
- **Weather background.** The field is laid out randomly on each load and coloured by the local weather: seven skies,
  each with a day and a dusk palette, tinted by temperature.
- **The orb** never sits still: it breathes, floats, churns slowly, drifts through its mood colours, and throws in an
  occasional spontaneous glance. In daylight it casts a soft tinted shadow instead of glowing.

### Protocol rules the code depends on (Aelora `FRONTEND.md`)

- The JWT is pinned at connect time, so the app reconnects on `TOKEN_REFRESHED`. Close `4001` is fatal and `1008`
  triggers a reauth.
- Replies are matched by `type`. Same-type requests are queued, and every request has a timeout.
- Broadcasts echo back to the sender, so the app upserts by id and lets the newest `updated_at` win.
- Streamed tokens can be retracted (`tool:working`), and `done.text` is authoritative.

### Performance

- Geometry lives in `stores/metrics.ts`, which stacks the header, Wendy's line, the grid and the rail. All motion is
  transforms between known boxes.
- One persistent WebGL orb. It pauses when the page is hidden and caps DPR at 2.
- Supabase and the Markdown renderer are code-split. The initial JS is about 159 KB gzipped.
- The app respects `prefers-reduced-motion`.
