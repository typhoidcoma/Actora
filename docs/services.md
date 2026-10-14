# Supporting services

What sits around the main screen: sign-in and Google, push reminders, sound, voice, the look, check-ins, the Vault,
focus sessions, offline capture and the phone layout. For the agent's ui_actions see [agent-ui.md](agent-ui.md).

Paths are from the repo root. The 3D app (`3dapp/`) imports these same modules through `@actora/*`; where it differs,
this file says so.

## 1. Sign-in and Google

### One step: sign in and connect Google

- `src/auth/supabase.ts`
  - `getSupabase()` builds the Supabase client lazily. URL and anon key come from `VITE_SUPABASE_*` if set, else from
    Aelora's `GET /api/public-config` (`supabase.url`, `supabase.anonKey`). Mock mode never loads Supabase.
  - The client uses `flowType: 'pkce'`, `persistSession`, `autoRefreshToken` and `detectSessionInUrl`.
  - `GOOGLE_SCOPES`: `openid`, `email`, `calendar.events`, `gmail.modify`, `gmail.settings.basic`. Keep it in sync with
    `GOOGLE_SCOPES` in Aelora's `src/integrations/google-calendar/google-oauth.ts`.
  - `signInWithGoogle()` calls `signInWithOAuth` with those scopes and
    `queryParams: { access_type: 'offline', prompt: 'consent select_account' }`.
    - This always shows Google's account chooser and the permissions screen. That is deliberate: it matches the Aelora
      dashboard, and `offline` + `consent` are what make Google return a refresh token every time.
  - `redirectTo` is `config.authRedirectUrl`, or the current origin and path.
- `src/google/google.ts` `linkGoogleFromSession(session)`
  - Called from the auth listener in `src/App.tsx` (2D) and `3dapp/src/App.tsx` (3D), for the initial session and every
    `onAuthStateChange`.
  - If the session carries `provider_refresh_token`, it posts `{ refresh_token, scope: GOOGLE_SCOPES }` to
    `${baseUrl}/api/google/calendar/connect-token` with the Supabase JWT as Bearer.
  - Each token is sent once per visit (a `linked` set); a failed post removes it so a later sign-in can retry.
  - On success it refreshes the status and toasts `Google connected · <email>`.
  - Skipped in mock mode.
- A failed OAuth return (denied consent, bad redirect) is read from the URL by `oauthError()` in `src/App.tsx` and shown
  on the sign-in screen.

### Status, menu and reconnect

- `refreshGoogle()` reads `GET /api/google/calendar/status` into `useGoogle`. It runs on every `hello`
  (`src/aelora/router.ts`) and after each connect, sync or disconnect.
- Status fields: `configured`, `connected`, `google_email`, `needs_reauth`, `gmail_read`, `gmail_compose`.
- Menu (`src/ui/Menu.tsx`), shown only when `configured`:
  - **Google** item. Hint from `googleHint()`: `Connect`, `Reconnect` (needs reauth, or no Gmail compose: older grants
    were calendar-only), or the email.
  - Tap: `connectGoogle()` when `googleNeedsAction()`, else `syncGoogle()` (`POST /api/google/calendar/sync`).
  - **Disconnect Google** when connected (`POST /api/google/calendar/disconnect`).
- `connectGoogle()` is the separate, popup consent flow:
  - Opens a blank window inside the tap (popup blockers), then points it at the URL from
    `GET /api/google/calendar/connect`. A blocked popup falls back to the same tab.
  - Finishes on a `message` from Aelora's origin, the popup closing, or after 3 minutes; then re-reads status.
  - A 503 means Google isn't set up on the server.

### Google-needed errors

- `isGoogleError()` matches `google_not_connected`, `google_scope_missing` and `google_needs_reauth`.
- `src/aelora/chat.ts`: when a tool step fails with one of these, it shows an error toast,
  "<name> needs your Google account for that.", with a **Connect** action that runs `connectGoogle()` (9 s).

### Token refresh

- Supabase refreshes the JWT itself (`autoRefreshToken`).
- The socket pins the JWT at connect time, so both apps call `reconnectAelora()` on `TOKEN_REFRESHED`.
- Each fresh Google sign-in also hands Aelora a new Google refresh token, which renews calendar and Gmail access.

## 2. Push reminders

Files: `src/push/push.ts`, `src/stores/push.ts`, `public/sw.js`. Follows Aelora's `docs/PUSH.md`. Push is a doorbell for
when the app is closed; while it is open, reminders arrive as socket events.

### Service worker (`public/sw.js`)

- Push transport only: `skipWaiting` + `clients.claim`, no fetch handler, no caching.
- Always shows a notification for a push (silent pushes are penalised). The fallback title is the literal `'Wendy'`.
- On click: posts `{ type: 'notification-click', notificationId, url }` to an open window and focuses it, or opens a
  new window at `url` with `?notification=<id>`.

### Status (`src/stores/push.ts`)

- `unknown`, `unsupported` (no worker or PushManager, or no VAPID key from the server), `needs-install` (iOS Safari
  tab), `off`, `on`, `denied`.
- `snoozePushOffer(days = 7)` stores a snooze in `localStorage` (`actora.push.snooze`).

### Flow (`src/push/push.ts`)

- `startPush()` (`src/push/start.ts`) runs in both apps (`src/ui/Stage.tsx`, `3dapp/src/App.tsx`). It calls
  `initPush()`, which registers `/sw.js` and works out the status without prompting, and it sets the notification
  opener.
- `enablePush()` must run from a tap. It asks permission first (Safari drops the gesture after awaits), then:
  - waits for an active worker, drops a subscription made with a different server key, subscribes,
  - retries "push service error" failures twice, the last time on a freshly registered worker (`subscribeHard`),
  - sends `push.subscribe` and waits for `push.subscribed`.
  - Every failure is said in the agent's line; Brave gets specific advice.
- `resubscribe()` re-sends the subscription on every `hello` (iOS drops subscriptions silently).
- `disablePush()` unsubscribes and sends `push.unsubscribe`.
- `testPush()` sends `push.test` and reports `sent/devices` in her line.
- `notifyInBackground()`: a reminder that arrives over the socket while the tab is hidden or unfocused gets a real OS
  notification from the page, because the server skips Web Push whenever a socket is live. Called from `announce()`
  in `src/aelora/router.ts`.

### Opting in

- One quiet chip, last on the rail: _Let <name> remind me_ (`src/options/local.ts` `pushOffer`). It appears only after
  the agent has replied at least once, only while status is `off`, and not while snoozed.
- In an iOS Safari tab the chip is _Get reminders here_, which explains Add to Home Screen (`INSTALL_HELP`).
- The agent's `push.offer` pushes _Let <name> remind me_ plus _Not now_ (snoozes 7 days), or _Get reminders here_.
- Menu: **Reminders** with hint `On` / `Off` / `Add to Home Screen` / `Blocked in browser settings`, and
  **Send a test reminder** while on.

### Opening from a notification

- `setNotificationOpener()`, set by `startPush()`, routes both worker messages and cold starts:
  - `?notification=<id>` opens that reminder's own item panel (`ui.open({ kind: 'notification', id })`) and marks it read,
    waiting for the list to load if needed.
  - `?dm=<threadId>` opens that conversation in People.
- The query parameters are removed from the URL after use.
- **Which app opens.** If a window is open, the worker focuses it and hands it the tap.
  - With no window open, it opens the site root, because the server and the worker only know `/`.
  - Each app records itself in `localStorage['actora.app']` (`/` or `/3d/`) when push starts.
  - A small script in `index.html` forwards a root URL carrying `?notification=` or `?dm=` to `/3d/` when that's
    the app used last. It only forwards from `/`, so it can't loop.

## 3. Sound

Files: `src/sound/sound.ts`, `public/sounds/sine/`.

- The kit is **Sine** (kit 01) from SND by Dentsu Lab Tokyo (https://snd.dev/), taken from `snd-lib` v1.2.4. Terms and
  credit: `public/sounds/sine/CREDITS.md`.
- One audio sprite: `audioSprite.ogg` where the browser decodes Ogg Vorbis, else `audioSprite.m4a` (Safari).
  `audioSprite.json` is SND's full sprite map; `SPRITE` in `sound.ts` copies only the entries used.
- The sprite is fetched and decoded on the first play and cut up with Web Audio. A failed load retries next time.
- Callers name a moment, never a file: `play('reply')`. `MOMENTS` maps each one to sprite keys and a volume.

| Moment     | Sound                | Played from                                                                          |
| ---------- | -------------------- | ------------------------------------------------------------------------------------ |
| `sent`     | `swipe_01`           | sending to her (`src/aelora/chat.ts`) or a friend (`src/social/social.ts`)           |
| `reply`    | `transition_up`      | her reply starting to stream (`src/aelora/chat.ts`)                                  |
| `message`  | `select`             | a friend's message, unless muted or already looking (`src/social/social.ts`)         |
| `done`     | `toggle_on`          | task completed (`src/aelora/client.ts`), reminder marked read (`src/options/run.ts`) |
| `reminder` | `notification`       | a reminder arriving while open (`announce()` in `src/aelora/router.ts`)              |
| `tap`      | `tap_01` to `tap_05` | any pressable element (random pick)                                                  |
| `on`       | `toggle_on`          | sounds switched on                                                                   |

- `play()` is silent when sounds are off, the page is hidden (the OS notification speaks instead), or Web Audio is
  missing. The same moment won't repeat within 120 ms. A suspended `AudioContext` is resumed on the first gesture.
- `installTapSounds()` (called in `src/main.tsx` and `3dapp/src/main.tsx`) adds one capture-phase `pointerdown`
  listener for `button`, `[role="button"]`, `[role="switch"]` and `a`. Disabled and `aria-disabled` controls are skipped.
- Opt out with `data-sound="none"` on the control or an ancestor. The send buttons do this because they play `sent`
  (`src/ui/Composer.tsx`, `src/ui/KeyboardSheet.tsx`, `src/ui/people/PeopleThread.tsx`).
- On by default, per device (`localStorage` `actora.sound.v1`). Menu item **Sounds** toggles it via `sound.setOn()`.

## 4. Voice

File: `src/voice/speech.ts`. Speech to text only; the app does not speak aloud.

- Uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` (Chrome and Edge use their online service; Safari
  can run on device). Firefox has none.
- `listen()` first asks for the mic with `getUserMedia` so a blocked or missing mic gets a clear reason, then runs the
  recognizer with `continuous` and `interimResults`, in `navigator.language`.
- Ends 1.6 s after the last words, or after 8 s of nothing. Delivers the whole transcript once.
- `speechProblem()` turns error codes into plain sentences (`unsupported`, `not-allowed`, `audio-capture`, `network`,
  `insecure`, `no-speech`).
- `toggleVoice()` in `src/options/run.ts` wires it up:
  - interim text goes to `optionsStore.voice()` and bumps the orb,
  - the final text is sent as a chat turn (`say()`),
  - errors become a 7 s toast; when voice is impossible (`unsupported`, `not-allowed`, `service-not-allowed`,
    `insecure`) the keyboard opens instead.
- Started from the orb (`src/ui/OrbDock.tsx`), the home bar, the option rail and the chat composer's mic.
- The agent's `voice.listen` can't start the mic (browsers need a gesture), so it pushes a _Tap to talk_ chip.

## 5. Look

### Theme: day and dusk

- `ThemeMode` is `auto`, `day` or `dusk` (`src/stores/ui.ts`). `auto` follows the sun.
- `useTheme()` in `src/ui/Theme.ts`: in `auto`, `isDaylight()` compares the time of day with today's sunrise and sunset
  from the weather (or 06:00 to 19:00 without a forecast). Rechecked every minute.
- `useThemeSync()` sets `<html data-theme>` and updates `<meta name="theme-color">` to the scheme's background for that
  theme. `index.html` starts it at `#F3F3FE`.
- Menu item **Look** cycles Follows the sun, Daylight, Dusk.
- The agent's `theme.set` takes `auto`, `day`, `dusk` and words such as `dark`, `night`, `light`, `system`
  (`THEME_WORDS` in `src/aelora/router.ts`).

### Colour scheme engine

- `src/color/oklch.ts` (colour maths) and `src/color/scheme.ts` (`buildScheme`). Brand colours, or the agent's request,
  go in; CSS variables for both themes come out. Guardrails, all in OKLCH:
  - gamut mapping by chroma only,
  - lightness and chroma bands for roles; near-neutral surfaces,
  - `urgent` must be warm, `calm` must not,
  - ΔE ≥ 0.09 between heat levels and between item kinds,
  - WCAG contrast: roles ≥ 3:1, ink ≥ 4.5:1, text ≥ 7:1.
  - Whatever was adjusted is reported in `notes`, which reach the agent as `screen.colors.notes`.
- `src/stores/scheme.ts` holds the live scheme and writes it to a `<style id="scheme">` (`initScheme()` in both
  `main.tsx` files). Scheme colours are registered CSS properties, so changes cross-fade.

### Applied immediately

- `theme.set`, `colors.set` and `colors.reset` run straight from `runUiAction` in `src/aelora/router.ts`; no
  confirmation step.
- `colors.set` merges with the current request; it lasts 8 hours by default, `hours` capped at 168. It expires on a
  timer back to the brand.
- `colors.reset`, or the menu's **Reset colours** (shown while the agent's palette is on), restores the brand.

### Persistence

- `src/stores/appearance.ts`:
  - The theme is cached locally (`actora.theme.v1`) so the first paint is right.
  - Theme and the agent's palette sync to the user's Supabase `user_metadata.actora_appearance` (debounced 800 ms), and
    load from it at sign-in.
  - A different user on the same browser resets to defaults first (`actora.look.owner.v1`).

### Manifest

- `public/manifest.webmanifest`: `theme_color` and `background_color` are `#191832`, display `standalone`.

### Weather (`src/weather/`)

- `sky.ts` `watchSky()`: browser geolocation (rounded to about 1 km), then Open-Meteo's current weather code, `is_day`,
  temperature and today's sunrise/sunset. No key.
  - Cached 20 minutes (`actora.sky.v1`), refreshed every 20 minutes and when the app becomes visible.
  - No permission or no network: falls back to the clock (clear sky, day 06:00 to 19:00).
  - WMO codes map to seven skies: clear, partly, cloudy, fog, rain, storm, snow. Fahrenheit for US, LR and MM locales.
- `palette.ts`: per-sky day and dusk colours from the brand palette, overridden by the agent's `ambient` colours.
- `Ambient.tsx`: the drifting, blurred colour field behind the glass; layout is random per load. The 3D app uses the
  same sky in `3dapp/src/scene/Sky.tsx`.
- The menu header shows the temperature and sky when live.

## 6. Check-ins, the Vault, focus sessions, offline capture

### Check-ins (`src/checkins/checkins.ts`)

- The agent's now-and-then "how's it going?" while the app is open. Started in `src/ui/Stage.tsx` and
  `3dapp/src/App.tsx`.
- Only when all hold: on, home screen, visible, not busy, idle 2 to 30 minutes, 08:00 to 21:00, 20 minutes since the
  last chat, 30 minutes after opening, under 4 today, and past the next slot (random 60 to 120 minutes).
- Sent over the welcome's path (`greet()`, `system_chat`) with a directive built from facts (focus session, overdue
  tasks, a just-ended event, the last chat). Shows as her line.
- Chips: her own answers if she pushed some, else _All good_, plus _Not now_.
- _Not now_, or two ignored in a row, doubles the gap (up to 8×). An answer resets it.
- State is per user in `localStorage` (`actora.checkins.v1`). Menu **Check-ins** and the agent's `checkins.set` toggle it.
- Dev: `__actora.checkin()` sends one now.

### The Vault (`src/stores/vault.ts`, `src/ui/cards/VaultPanel.tsx`)

- What the agent remembers about the user (Aelora's vault). Loaded with `vault.list` when the panel opens; kept live by
  `vault:*` events.
- Twelve categories in a fixed order with plain names (`CATEGORIES`); unknown ones fall into Context.
- Search (every word must match) and a category chip; both live in the store so the agent can set them
  (`vault.search`).
- The user can add a memory (`vault.remember`) in one of six categories, forget one with two taps (`vault.delete`), and
  hide one from their receptionist (`vault.update` `assistant_hidden`). All optimistic, rolled back on failure
  (`src/aelora/client.ts`).
- Opened from the menu, by `vault.open` / `vault.close`, or in 3D from `3dapp/src/dom/Overlay.tsx`.

### Focus sessions (`src/stores/session.ts`)

- Aelora's sessions. `startFocus()` / `endFocus()` in `src/aelora/client.ts` send `session.start` (optional anchor, max
  200 characters) and `session.end`.
- Started by the _Focus on this_ pill on the top card (`src/options/local.ts`) or the agent's `start_session` tool.
- `session.list` on every `hello`; the newest open one is active.
- `src/ui/SessionChip.tsx`: a timer chip top-left with End, hidden while the chat or a panel is open.
- Check-ins mention a running session.

### Offline task capture (`src/stores/captures.ts`)

- `captureTask()` (`src/aelora/client.ts`) is used by the composer in capture mode and the keyboard sheet.
- Online: `task.create` at once. Otherwise the thought is kept in memory and `localStorage` (`actora.captures.v2`), tagged
  with its owner.
- `flushCaptures()` runs after `task.list` loads on each connect. It adds only that user's thoughts and skips titles
  already on the list (a create whose reply was lost).

## 7. Phone layout

### `src/stores/metrics.ts`

- One source of truth for geometry: line, grid, orb, rail, chat sheet, panels. Mirrored into CSS variables (`--grid`,
  `--gap`, `--orb`, `--notch`, `--radius`). `watchMetrics()` re-measures on `resize` and `visualViewport` resize.
- `compact`: width under 640 px. `short`: height under 520 px.
- `stack`: compact, not short, and portrait (height ≥ 1.15 × width). The orb sits small at the top, her line under it,
  and the four cards in one column (scrolling below 96 px per card). Panels run edge to edge down to the rail;
  the chat sheet fills the screen.
- Keyboard detection (`keyboardUp`):
  - Tracks the tallest viewport height seen at the current width (reset when the width changes).
  - Up when width < 640, an `INPUT`, `TEXTAREA` or contenteditable has focus, and `innerHeight < 0.8 × tallest`.
  - Then the layout is computed at the tallest height (so the shrunken viewport isn't read as a short, wide tablet),
    and `panel.h` and `sheet.h` are cut to the visible height.
- Effects of `keyboard: true`:
  - `src/ui/Stage.tsx` hides her line and the option rail.
  - `src/ui/cards/Panel.tsx` and `src/ui/people/PeopleThread.tsx` shrink their headers.
- The 3D app overrides these metrics to fit its in-scene focus panel (`useHostMetrics` in `3dapp/src/dom/Overlay.tsx`).

### `src/stores/phone.ts`

- `phone.compact()` lets code that can't import the metrics store (it measures the DOM on load) ask whether the layout
  is the phone one. It returns `false` until `metrics.ts` loads and fills it in.
- No module currently calls it; only `metrics.ts` imports it.

### Other phone specifics

- Typing is in the menu (**Type instead**) because the rail has no keyboard button on phones.
- The session chip keeps left of the orb in the stacked layout.
