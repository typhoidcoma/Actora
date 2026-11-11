# Actora architecture

This is the mental model to have before changing anything. Actora is a client for the Aelora agent backend. The agent's
name comes from the server (`hello.botName`; Wendy today). There are two apps:

- **2D** (`src/`): the React + TypeScript web app. Vite builds it at the repo root, and it is what deploys.
- **3D** (`3dapp/`): a WebGPU client that runs the same brain from `src/` (imported as `@actora/*`) and renders it
  around an animated character.

Read [agent-ui.md](agent-ui.md) for the agent's side of the contract (every ui_action, the `screen` snapshot). This
file covers the client side. File paths are given so you can check every claim. When this file and the code disagree,
the code wins.

## Layout

### `src/`

- `aelora/`: everything that talks to Aelora. The socket, request/reply, the frame router, the chat state machine,
  ui_actions, REST, and the in-browser mock.
- `auth/`: the Supabase client and Google sign-in (`supabase.ts`), and the sign-in screen.
- `checkins/`: the agent's now-and-then check-ins while the user is around but quiet.
- `color/`: the OKLCH colour scheme engine that turns the brand, or the agent's `colors.set`, into CSS variables.
- `finds/`: box 4's fun finds, and the separate "Fun finds" thread the hunt runs in.
- `google/`: Google connection status, connect, disconnect and sync, over Aelora's HTTP API.
- `options/`: the tap options (pills). Local ones (`local.ts`), agent-written ones (`agentOptions.ts`), and what a tap
  does (`run.ts`).
- `priority/`: the three priority cards. Local score (`score.ts`) and the agent's re-rank (`rank.ts`).
- `push/`: Web Push subscription and in-app notifications.
- `social/`: friends and direct messages (People). Frame handling and the home message card.
- `sound/`: a few quiet UI sounds from one audio sprite.
- `stores/`: zustand stores. The app's state lives here.
- `styles/`: the one stylesheet (`index.css`): Tailwind v4, theme tokens, glass.
- `tasks/`: the short brief the agent writes for a task that has no notes.
- `ui/`: React components and DOM-bound helpers (cards, tiles, chat, rail, orb, People).
- `voice/`: speech-to-text through the browser's recognizer.
- `weather/`: local weather (Open-Meteo) for the ambient background.
- Top-level files: `main.tsx` (boot), `App.tsx` (auth gate), `config.ts` (env), `freshness.ts` (reload onto a new deploy
  when idle), `secureUrl.ts` (http to https for agent-found links).

### `3dapp/src/`

- `main.tsx`, `App.tsx`: boot (WebGPU check, `NoWebGPU.tsx`) and the same auth gate as 2D, using the shared modules.
- `scene/`: the R3F world. The room (`room/`), lighting, post, the character, and the cards drawn in WebGPU
  (`panels/`). `Anchor.tsx` pins DOM elements to points in the scene. `FocusPanel3D.tsx` hosts open panels through CSS3D.
- `look/`: 3D-only behaviour that isn't drawing. Layout, camera focus, captions, canvas painting, the intro walk-in,
  long-answer and think-away timing, readiness.
- `bridge/`: agent state to animation. Phase to clip (`agentAnim.ts`), procedural poses (`poses.ts`), wandering
  while she works (`wander.ts`).
- `dom/`: the DOM layer over the canvas (`Overlay.tsx`, `Loader.tsx`). It hosts the 2D app's own React components.
- `character.ts`: clip names and the model URL.

## Data flow

```
Supabase session (App.tsx)
  -> startAelora (aelora/client.ts)
       -> AeloraSocket (aelora/socket.ts)   real WebSocket, or MockWebSocket in mock mode
       -> every frame: routeFrame (aelora/router.ts)
            -> owner check (owner.ts) -> finds thread -> chat -> social -> router switch
            -> action objects on stores (entities.upsertTask, ui.openChat, ...)
  -> React components read stores with useX hooks
```

1. **Auth.** `App.tsx` gets a Supabase client from `getSupabase()` (`src/auth/supabase.ts`). The URL and anon key come
   from `VITE_SUPABASE_*`, or else from `GET /api/public-config`. Once signed in, `Connected` calls `startAelora` with
   `getToken` (the current access token) and `onReauth` (refresh the session). The socket sends the token as its
   first frame (`{type:"auth", token}`), not in the URL. Aelora checks it only at connect, so `TOKEN_REFRESHED` needs
   no reconnect (one would end her reply mid-turn). Mock mode skips auth and passes the token `'mock'`.
2. **Socket.** `startAelora` (`src/aelora/client.ts`) builds an `AeloraSocket`. In mock mode it lazily imports
   `MockWebSocket`. It returns a stop function synchronously, so a React StrictMode double mount cancels cleanly.
3. **hello.** The socket counts as `open` only once `hello` arrives. `client.ts` refuses a `hello` for a different
   user than the signed-in one (`giveUp`). The router's `hello` case adopts the user for per-user caches (finds,
   greeting, main thread), resets per-user stores when the user changed, records `botName`, `isAdmin` and mood, then
   runs `bootstrap()`.
4. **Bootstrap** (`router.ts`). The post-hello checklist: `tz.set`, `client_state`, then the notification, task, goal
   and calendar lists (each retried twice, then marked hydrated anyway so nothing waits forever), the push
   resubscribe, the Google status, `session.list`, and the social connect. Offline captures are flushed once tasks
   load.
5. **Routing.** `routeFrame` runs every frame through the owner filter, then lets `handleFindsFrame`,
   `handleChatFrame` and `handleSocialFrame` claim it, in that order. Anything left goes to the router's own switch
   (replies like `task.list`, `goal.updated`) and, for `type: 'event'`, to `routeEvent`.
6. **Stores to React.** Components subscribe with hooks. Side effects that follow store changes (resending
   `client_state`, for example) are wired with `useX.subscribe` in `client.ts`, not in components.

### Store convention

Each file in `src/stores/` creates a zustand store and exports two things side by side:

- a hook, `useX` (`useUi`, `useAgent`, `useEntities`, `useSocial`, `useVault`, `usePending`, ...), for React and for
  `getState()` / `subscribe()` outside React;
- a plain action object named for the domain (`ui`, `agent`, `entities`, `social`, `vault`, `pending`, `sessions`,
  `toast`, `optionsStore`, `priorityStore`), whose methods call `setState`.

Protocol code calls the action object (`entities.upsertTask(t)`, `ui.openChat()`), not `setState` with ad hoc shapes.
Small, local patches do use `useX.setState` directly; `chat.ts` does this for its streaming fields. Pure derivations
(`waitingSummary`, `mergePriorities`, `contextKeyOf`) are exported as functions next to the store, so tests and the
router share them.

## The protocol layer (`src/aelora/`)

Wire types are in `protocol.ts` (source of truth: Aelora's `WEBSOCKET.md` and `FRONTEND.md`). Every frame is
JSON with a `type`. Data broadcasts arrive as events:

```json
{ "type": "event", "event": "task", "data": { "type": "task:updated", "task": { "id": "…", "updated_at": "…" } } }
```

### FrameBus

`FrameBus` (`socket.ts`) is the only interface the protocol code needs:

```ts
interface FrameBus {
  send(msg: ClientMessage): boolean // false if the socket isn't open
  subscribe(fn: (frame: ServerFrame) => void): () => void
}
```

`AeloraSocket` implements it, and so does every test fake. The router, chat, finds, social and request code take a
`FrameBus` argument. They never reach for the socket directly.

### request(): correlation by reply type

Aelora matches replies by `type`, never by id. `request(bus, msg, replyType, opts)` (`request.ts`) handles that:

- Requests with the same reply type are queued one at a time. Different reply types run concurrently.
- Every request times out (12 s by default) and resolves `null` rather than throwing.
- A reply that arrives after its request timed out is swallowed, so it can't resolve the next request of that type.
- `opts.match` accepts only a reply about a given item. `client.ts` uses `about(id)` for task, goal and event writes.
- An unattributed `error` frame fails only the most recent request, and only within 3 s. An error that names its
  `request` fails only a request of that type. Chat error codes (`CHAT_ERROR_CODES`) are left to `chat.ts`.
- `resetLateReplies()` runs on each `hello`.

Writes in `client.ts` are optimistic. They patch the store, send, and restore with a toast if the reply is `null`.
Deletes go through `withUndo` (`stores/toast.ts`), so the server only hears about them once the Undo window closes.

### Upserts and echoes

Broadcasts echo back to the sender, so the same row can arrive as a reply and again as an event. `entities.ts` keeps
the newer row for tasks and goals (`updated_at`, ties go to the incoming row). Notifications are overwritten by id.
Calendar events are replaced by event id: a recurring series triggers a debounced `calendar.list` refetch instead
(`applyCalendarEvent` in `router.ts`). Optimistic writes leave `updated_at` alone, so the server's row always wins.

### Owner filtering (`owner.ts`)

Admin sockets also receive every other user's events. `eventVerdict` decides per event:

- An event that names an owner is applied only if it is this user's.
- On a non-admin socket, an unlabelled event is applied (the server already scoped it).
- On an admin socket, an unlabelled event is applied if it is `pending_action` or `session`, dropped if it drives the
  screen (`agent_command`, `mood`, `emotion`, ...), and turned into a refetch of our own list if it is data (`task`,
  `goal`, ...).

### Reconnect and close policy (`closePolicy.ts`, `socket.ts`)

| Close code    | Action                                                  |
| ------------- | ------------------------------------------------------- |
| `4001`        | Fatal (admin kick). No retry until a deliberate reload. |
| `1008`        | Refresh the Supabase session, retry once, then fatal.   |
| `1013`        | Slow retry (4 s base, 60 s cap).                        |
| anything else | Backoff with full jitter (0.5 s base, 20 s cap).        |

The socket also has a 25 s connect timeout (Cloud Run cold starts), an app-level `ping` every 25 s, and a reconnect if
nothing has arrived for 60 s. It wakes on `visibilitychange` and `online`. A status change away from `open` aborts any
chat turn in flight (`abortTurnOnDisconnect`).

### The chat state machine (`chat.ts`)

```
chat ─> [conversation.created] ─> chat.start ─> token* / tool.progress* ─> done | error
```

- `sendChat` always addresses the user's own thread (`mainThread.ts`). With no thread yet, it sends
  `conversation.new` and holds the message until `conversation.created`. It refuses to send while a turn is in flight.
- Frames belong to the turn by `conversationId === turnId`. The welcome line and check-ins go over `system_chat`,
  whose frames carry only `channelId: "system:<userId>"`, and are handled separately (`handleSystemFrame`).
- `token` appends to the raw reply. The store holds the reply scrubbed. A `mindmap` `tool:working` event retracts what
  has streamed so far. `done.text` is authoritative.
- `tool.progress` becomes steps for the activity trail (`activity.ts` words them). Screen actions and backstage tools
  (`perform_reaction`, `get_app_state`) are noted without switching her phase, so she doesn't flicker between
  speaking and working. A failure that names Google offers a Connect toast.
- A client-side backstop of 250 s (`TURN_TIMEOUT_MS`) fails the turn with a retry message. Aelora ends every turn by
  its own 240 s deadline, so this only catches a socket that went silent without closing.
- A `mindmap` `fact:extracted` event shows "Noted: ..." with an Undo that forgets the memory.

**Scrubbing** (`scrub.ts`). Sometimes the model writes a tool call into its reply instead of making it
(`perform_reaction{…}`). `scrubToolLeaks` removes known tool and action syntax, including a call still arriving at the
end of the stream. `done` logs `[scrub] leak survived` when something gets through.

**Written actions.** When she writes a ui_action as text (`colors.set{…}`), `writtenActions` finds it and `chat.ts`
runs it through `runUiAction` as soon as it has fully arrived, once per turn. A written `options.set` and any
`[label](say:…)` links become pills instead (`offerSayLinks`). Separately, `router.ts` runs a ui_action she called as if
it were a tool (`colors_set`), found by `strayAction` in `actions.ts`, for her own turns and the finds hunt.

**Emoji ack.** Her reply opens with one emoji. `splitAck` moves it onto the user's last message as her "got it" and
removes it from her text. `ackFits` keeps laughing emoji off messages that weren't jokes. `recentAcks` feeds
`screen.yourRecentEmoji`, so she can vary them.

### The finds hunt thread (`finds/finds.ts`)

Once a day (connected, lists loaded, no turn in flight) the app hunts for fun finds in a dedicated "Fun finds"
conversation, so the user's thread stays clean. The first hunt sends `conversation.new`, renames the thread, reopens the
user's own thread, then sends the directive. `handleFindsFrame` runs before the chat handler and claims every frame for
that thread. Cards come from her `finds.set`. If that never arrives (a ui_action event can miss a socket on another
server instance), the cards are parsed out of her reply after a short grace period. `conversations_disabled` turns
finds off. The thread id and the cards are cached per user in `localStorage`.

## How the agent drives the UI

The agent drives the screen in two ways, and both end in `runUiAction(action, args)` (`router.ts`):

- `event: 'agent_command'` with a command of type `ui_action`, `open_app` / `close_app`, `sequence`, or
  `avatar.react` (`runCommand`).
- The fallbacks above: a written action, or a stray tool call.

`AVAILABLE_ACTIONS` (`actions.ts`) is the advertised catalog. `LEGACY_ACTIONS` (`reader.*`, `reply.react`) are still
obeyed but not advertised. The server passes arguments through unchecked, so `runUiAction` validates them: items must
exist locally (`itemExists`), `why` is cut to 60 characters, `options.set` needs at least 2 options, and `hours` is
capped at 168. To add an action, add it to `AVAILABLE_ACTIONS`, handle it in `runUiAction`, give it words in
`activity.ts` if it should show as a step, and document it in [agent-ui.md](agent-ui.md) and the server playbook.

**Glances.** While the chat is open, the moves in `SCREEN_MOVES` (open a card, a list, finds, the Vault, People) run as
a glance through `peekThenChat` (`src/ui/peek.ts`). The thing shows for 5 s, then the chat comes back. Touching it
keeps it. `home.show` and `tile.close` are skipped while the chat is open, because they would only end the
conversation. During a glance, `talkKey()` sends any options she offers to the chat context.

### client_state and `ui.screen`

`sendClientState` (`router.ts`) sends the whole `ui` object every time:

```json
{
  "type": "client_state",
  "openApps": ["tasks"],
  "focus": "tile:tasks",
  "ui": { "client": "actora", "availableActions": ["home.show", "…"], "animations": ["idle", "…"], "screen": {} },
  "timestamp": "…"
}
```

`screen()` describes what is on screen: context, focus, selection, her pending welcome, the Vault, People counts (never
content), theme, reminders, check-ins, colours and the open list's rows. `homeScreen()` is the part that changes on
its own: priorities, box 4, pending approvals and pills.

When it is sent (`client.ts` and `router.ts`):

- after `hello`, in `bootstrap()`;
- right away when the user moves (`focus`, `chatOpen`, `selected`, People views) or the colour scheme changes;
- when her welcome finishes, so she knows what she asked;
- 800 ms after what's waiting in People changes;
- when `homeScreen()` changes, after a 1 s settle, compared by JSON signature, with a 60 s tick for cards that change
  with the clock.

## REST

All calls go to `config.baseUrl` with `Authorization: Bearer <JWT>` (`http.ts`; the socket's `?token=` form is
rejected over HTTP).

- **`POST /api/llm`** (`llm()`): a one-shot, stateless completion with no persona, tools or history. It throws
  `LlmError` with `retryAfterMs` on 429. Used by the agent-written options (`options/agentOptions.ts`), the priority
  re-rank (`priority/rank.ts`) and task briefs (`tasks/brief.ts`). In mock mode each of these calls `mockLlm` instead.
- **`GET /api/public-config`** (`getPublicConfig()`, unauthenticated, fetched once): the Supabase URL and anon key
  (`auth/supabase.ts`) and the VAPID key (`push/push.ts`).
- **Google** (`google/google.ts`): `status`, `connect`, `sync` and `disconnect` under `/api/google/calendar/` through
  `api()`. After a Google sign-in, `linkGoogleFromSession` posts the session's `provider_refresh_token` to
  `/api/google/calendar/connect-token`, so one sign-in also connects calendar and Gmail. The popup Connect flow gets a
  code back from Aelora's callback page (`aelora:gcal-code`) and redeems it with `POST /api/google/calendar/finish`
  (`api()` takes a JSON body for this). It is skipped in mock mode.

## The mock backend

`config.mock` (`src/config.ts`) is true when `VITE_AELORA_MOCK=1` or when `VITE_AELORA_BASE_URL` is empty. Then
`App.tsx` skips auth and `client.ts` opens `MockWebSocket` (`src/aelora/mock.ts`) instead of a real socket. The rest of
the app is unchanged: the mock speaks the real frames.

What it simulates:

- `hello` (user `mock-user`, `botName: 'Wendy'`), then `conversation.active`;
- seeded goals, tasks, events and notifications, held in a static db so they survive reconnects;
- the list, update, complete, delete and create requests, answered as event broadcasts the way the server echoes them;
- streaming chat from canned replies keyed by regex, with `tool.progress`, `emotion` events, `avatar.react` and mood;
  `system_chat` for the welcome; the finds hunt with a `finds.set` ui_action;
- sessions, the Vault, conversation list, new, rename and delete, push stubs, and a reminder drip into the inbox;
- People through `MockSocial` (`mockSocial.ts`): a friend (Sam) who writes back, a pending request, and a handle to
  claim;
- `mockLlm` for `/api/llm` callers.

## How 3D shares the brain

- **Alias.** `@actora/*` resolves to `../src/*` (`3dapp/vite.config.ts`, `3dapp/tsconfig.json`). The socket, router,
  chat, stores, options and ranking run unchanged.
- **Dedupe.** `resolve.dedupe` covers `react`, `react-dom`, `zustand`, `three` and `motion`. Without it, `../src` would
  resolve its own copies from the root `node_modules`, and the socket would fill one set of stores while the scene
  read another. Plain `three` is also aliased to `three/webgpu`.
- **Env and assets.** `envDir: '..'` reads the root `.env`. A dev middleware serves the root `public/`.
  `3dapp/src/styles.css` imports `src/styles/index.css`. Install at the repo root too, since `../src` resolves its own
  dependencies (Supabase) from there.
- **What 3D must not import.** The WebGPU scene (`scene/`, `look/`, `bridge/`) imports only framework-free modules
  (stores, protocol, `color/scheme`, `weather/sky`) and pure UI helpers (`ui/format`, `ui/markdownText`,
  `ui/tiles/data`, `ui/palette`, `ui/brand`). 2D DOM components (Tailwind, motion) are used only from `3dapp/src/dom/`:
  `Overlay.tsx` renders the 2D rail, chat sheet and panels and portals them into the CSS3D focus host or anchored
  elements. Don't import DOM UI into the scene graph. `3dapp/README.md` still says no DOM imports at all; that is out
  of date.
- **3D-only behaviour** goes in `3dapp/src/look/` (timing and layout), `bridge/` (animation from agent state),
  `scene/` (drawing) or `dom/` (the overlay). Where a shared behaviour must differ, `src` exposes a switch rather than
  a fork. For example, `main.tsx` sets `sayPolicy.openChatForLargeQuestions = false` (from `options/run.ts`).
- Changing anything in `src/` changes 3D too. Check both. The root build and Docker image ignore `3dapp/`.

## Testing

- Vitest runs in the **node** environment (`vite.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts']`).
  There is no jsdom. `3dapp/` has no tests.
- Tests sit next to their code as `*.test.ts` (33 files across `aelora/`, `stores/`, `options/`, `social/`, `ui/` and
  others).
- **Fake FrameBus.** Protocol tests drive `routeFrame` and `sendChat` with an in-memory bus, then assert on stores
  and on `sent`:

  ```ts
  class FakeBus implements FrameBus {
    sent: ClientMessage[] = []
    send(msg: ClientMessage) {
      this.sent.push(msg)
      return true
    }
    subscribe() {
      return () => {}
    }
  }
  ```

  When a test needs replies (`request.test.ts`, `captures.test.ts`), the fake keeps a `Set` of subscribers and feeds
  frames into it.

- **Browser globals.** Use `vi.stubGlobal('window', …)`, `'document'`, `'localStorage'` or `'fetch'` with the few
  members the code touches (`ui/peek.test.ts`, `social/pictures.test.ts`, `google/google.test.ts`). Shared code that
  may run under test guards browser globals (`typeof document !== 'undefined'` in `router.ts`, `typeof window` in
  `peek.ts`); keep doing that.
- Reset stores in `beforeEach` (`useAgent.setState(…)`, `entities.reset()`), since they are module singletons.
- **Run:** `npm test` from the repo root (`vitest run`). `npm run typecheck` and `npm run lint` (oxlint) cover the
  rest. On Windows, if vitest finds no tests or complains about paths, run it from the canonical-case path
  (`H:\Projects\Actora`), not one with a different drive-letter or folder case.

## Conventions

- **Comments explain why**, not what: the protocol quirk, the race, the user-visible reason. Write them in plain,
  user-facing words ("she", "the user", "her line", "the cards"), as in `chat.ts` and `router.ts`. Cite the Aelora doc
  section when a rule comes from the server (`FRONTEND.md → "Close codes"`).
- **User-facing text** is short and plain, says what happened, and offers a way back ("Couldn't move X, so it's back.",
  with an Undo where possible). Never hard-code the agent's name: use `agentName()` or `botName`.
- **Naming.** Hooks are `useX`, action objects are lowercase domain nouns, and components are PascalCase `.tsx`.
  Logic modules are camelCase `.ts`. Wire fields keep the server's spelling (`updated_at`, `conversationId`).
  ui_actions are `name.verb` with exactly one dot.
- **Validate everything from the agent.** Assume any argument may be missing, wrong or cut off (`looseArgs`), and
  ignore ids that don't exist locally.
- **Dependencies.** The root has few runtime dependencies (React, zustand, motion, three, Supabase, react-markdown).
  Don't add one lightly. Heavy ones are code-split (Supabase, Markdown, the mock, and three/webgpu for the orb).
- **Graphics.** WebGPU and TSL only (`three/webgpu`, `three/tsl`): [agents/graphics.md](agents/graphics.md).
- **Styling.** Use Tailwind with the theme tokens from `src/styles/index.css` (`bg-bg`, `text-muted`,
  `text-accent`, ...). These map to `--role-*` (fills) and `--ink-*` (readable text), which the scheme engine
  generates. Don't hard-code colours. Brand colours live in `src/ui/brand.ts`.
- **Motion.** Use the shared springs in `src/ui/motion.ts` (`morph`, `glide`, `jelly`, `press`), and lay out from
  `stores/metrics.ts` so animations are transforms between known boxes. Respect `prefers-reduced-motion`.
- **Dev console.** In dev, `window.__actora` (`src/main.tsx`) can run ui_actions, send chat, inject server events and
  make raw requests. It is the quickest way to try a change against the mock.
