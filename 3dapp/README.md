# Actora 3D

A 3D client of Actora built around an animated character: three.js `WebGPURenderer` with React Three Fiber v9. It
lives beside the 2D app, runs on the 2D app's code, and is deployed with it at `/3d/`.

**Product rule: chat response speed always beats animation.** Her words show the moment they arrive. No walk, camera
move or pose ever holds text back; animation plays alongside it (`docs/principles.md`, "Reading beats animation").

## WebGPU only

- `src/gpu.ts` checks for a hardware WebGPU adapter before anything mounts. There is no WebGL2 backend and no software
  (fallback) adapter: either one gets `NoWebGPU.tsx` ("This version of Actora needs WebGPU") instead of a slow app.
- If the renderer later fails to get a device, `webgpuFailed()` swaps in the same notice.
- The alias `three` → `three/webgpu` (in `vite.config.ts`) keeps the WebGL renderer out of the bundle.

## How it shares the 2D app's brain

`@actora/*` is an alias for `../src/*`. The socket, chat state machine, ui_action router, stores, options and priority
ranking are the same code the 2D app runs, imported unchanged. `vite.config.ts` dedupes `react`, `react-dom`,
`zustand`, `three` and `motion` so that `../src` and this app share one copy of each store. Without that, the socket
would fill one set of stores and the scene would read another.

The DOM parts of the 2D UI (rail, chat, item panels) are reused as real DOM in the overlay. Inside the WebGPU scene,
only its pure helpers (`markdownText`, `format`, `tiles/data`) are used; the cards are repainted on canvas.

## How it's built

- **The room** (`src/scene/room`): a procedural atrium in plain 70% white. The window wall is on the left, with the
  column, three steps up to a raised floor, and a mezzanine.
- **The light is the theming** (`Lighting.tsx`):
  - "Follows the sun" moves a real sun through the windows from today's sunrise to sunset. A chosen Day or Dusk uses
    a fixed sun.
  - Her mood tints the warm cove and the wall wash. A ringing reminder makes the cove breathe red.
  - Reflections are captured once, from the room's own light.
- **Soft shadows** (`room/pcss.ts`): contact-hardening PCSS for the sun. Crisp where a shadow meets what casts it
  (her feet, the column's base), softer with distance. The sun's shadow camera and map size are the `SHADOW` and
  `SHADOW_MAP` constants in `Lighting.tsx` (4096, or 2048 on touch devices).
- **Post** (`Post.tsx`): ambient occlusion (the UI layer excluded), bloom, and depth of field that blends in when a
  panel opens.
- **Home** (`look/layout.ts`): she stands left of centre with her line as a caption over her head
  (`panels/AgentLine3D.tsx`). The four cards stand as one 2×2 block to her right. Phones stack everything below her
  head and shoulders, with the camera held still.

### Panels in the scene (`src/scene/panels`)

Drawn in WebGPU, in the same glass as the 2D pills: the room behind blurred, under a face painted on a canvas
(`look/paint.ts`: wrapping, fonts, glass tint and sheen). `Pane.tsx` is that shared surface.

- `Grid3D.tsx`: the 2D Grid's slots (`homeSlots`). Two ranked priorities, Chats top right, then list summaries.
- `PriorityCard3D.tsx`: kind, title, meta line and urgency heat; the alarm (red edge, halo, "Got it") when a reminder
  rings.
- `ChatsCard3D.tsx`: the user's conversations, waiting ones first: who, how many and when, never the text. A tap
  opens the newest waiting chat, else People.
- `ListCard3D.tsx`: a domain summary that fills a corner when there are fewer than two priorities.
- `FindsCard3D.tsx`: box 4, her fun finds with rotating photos (only hosts that allow CORS can be a texture).
- `PendingCard3D.tsx`: box 4 while something waits for your OK ("Waiting for your OK"); the answers are the pills.
  Grid3D swaps it with the finds, easing one out as the other comes in.

### The DOM overlay (`src/dom/Overlay.tsx`)

- **The rail**: the 2D `OptionRail`, chat, mic and menu, and the message box, pinned in the room by an `Anchor`.
- **Thinking**: the 2D `Activity` over her head while a turn runs and nothing has streamed yet.
- **FocusCaption**: her words beside her head while a card, list or finds is open (the chat shows them itself).
- **Focus content**: the open thing's 2D panel, portalled into the element the scene stands up as the focus panel
  (`FocusPanel3D.tsx`, CSS3D over WebGPU glass), its options in a strip at its foot.
- The 2D panels are lazy-loaded and prefetched once the scene is ready: item, finds, vault, **People**, the
  Calendar/Goals/Inbox/Tasks lists, and the keyboard, past-chats and date sheets.

### Behaviour only the 3D app has (`src/look`)

- `focus.ts`: `useFocused()`, true when the chat or any panel is open. The stage steps back and the camera comes in
  close on her.
- `caption.ts`: `useCaption()`, what she is saying right now (welcome, her reply's first sentence live while it
  streams, a reminder, a lost connection) and its colour. It fades after 10 s still, like the 2D line; what needs you
  stays.
- `longAnswers.ts`: after a long think (6 s, or two or more search/lookup steps), the chat opens so her answer can be
  read in full. It opens with her **first words**, never held for an animation or her walk back. Quick answers stay on
  her line. Only from home, once per turn.
- `thinkAway.ts`: you asked from the chat and she has said nothing after 2.5 s: the chat steps back to the room so you
  watch her think, with her thinking over her head. When her answer starts, `longAnswers.ts` brings the chat back.
  Not while a panel is up or you are typing.
- `her.ts`: `herOffset`, how far she has wandered from her spot, written each frame by the character and read by the
  camera rig, depth of field and the long-answer timing.
- `main.tsx` sets `sayPolicy.openChatForLargeQuestions = false`: a long question doesn't jump to the chat; the two
  rules above decide.

### The character

- `Character.tsx`, `bridge/agentAnim.ts`: agent phase to clip, `avatar.react` to additive emotes, and a head nod with
  the token stream. She turns to face you.
- **While she's working** (`bridge/wander.ts`): after about 2 seconds of a turn at home, she wanders the open floor
  beside her and checks her phone (a phone clip if she has one, otherwise a procedural pose). Wide screens only.
- **Thinking and emoji** (`bridge/poses.ts`): a turn with no tools gets a thinking pose (hand to chin), and searches
  get the wander. Her emoji reaction on your message is acted out once, then she carries on: thumbs up a raised fist,
  wave a wave, party arms up, heart a hand on her heart, laughing a laugh, surprise, shrug, thinking, thumbs down a
  head shake, anything else a nod. These are procedural poses on the Mixamo skeleton.

## Run

```sh
npm install            # at the repo root too: ../src's own deps (supabase, …) resolve from there
cd 3dapp
npm install
npm run placeholder    # rigged stand-in character (three.js Xbot); not in git
npm run dev            # http://localhost:5173 (served at /; the build uses /3d/)
```

- Same pinned port (5173, `strictPort`) and the same root `.env` as the 2D app, so sign-in and the backend work as
  they do there, or the mock if `.env` says so. Run one app at a time on 5173; for a mock copy beside it, use
  `VITE_AELORA_MOCK=1 npx vite --port 5176`.
- `npm run typecheck` checks this app and the `../src` it imports. There is no lint or test script here; the root
  tests cover the shared code.
- Dev hooks: `window.__actora` (`ui`, `chat`, `open`, `colors`, `stores`) and `window.__actora3d` (`busy`, `hold`,
  `gesture`, `poses`). See `docs/development.md` for those and for headless WebGPU screenshots.

## Deploy

Same Docker image and Cloud Run service as the 2D app. The `Dockerfile` installs this app, runs
`npm run placeholder`, builds it with base `/3d/` and copies `3dapp/dist` to `/3d` in nginx
(`deploy/nginx.conf.template`: its own SPA fallback, hashed assets cached a year, `/3d/models/` a day). Same origin,
so nothing extra in Supabase or Aelora CORS.

## Extra clips (Mixamo)

1. On mixamo.com, pick an animation (e.g. "Texting While Standing").
2. Download it as FBX, "Without Skin", "In Place".
3. Put it in `public/models/clips/`.
4. List it in `character.clips` (`src/character.ts`).

It's named after its file. `texting.fbx` becomes the "texting" clip, which the phone routine then uses instead of the
procedural pose. Any other name can be mapped in `character.busy`. The Xbot stand-in and Mixamo characters share the
skeleton, so clips bind as they are.

A clip named after a gesture (`thumbsup`, `wave`, `celebrate`, `heart`, `laugh`, `surprise`, `shrug`, `thinking`)
plays instead of its procedural pose. Good Mixamo picks are "Thumbs Up", "Waving", "Clapping", "Thinking",
"Shrugging", "Laughing" and "Surprised".

## Her model (USD to GLB)

USD is the source and GLB is what runs, because three.js can't play UsdSkel animation.

1. Put the file in `assets-src/` (not committed).
2. `npm run usd -- assets-src/character.usdz public/models/character.glb` (needs Blender on `PATH`).
3. Map clip names in [src/character.ts](src/character.ts). Each phase (`idle`, `thinking`, `tool`, `speaking`,
   `offline`) gets a looping clip. Reactions (`positive`, `negative`, `cognitive`) get one-shot emotes, layered
   additively.

Point `VITE_CHARACTER_URL` (root `.env`; the Dockerfile has no build arg for it yet) at it: `/models/character.glb` in dev,
`/3d/models/character.glb` deployed. Without it she's the stand-in (`placeholder.glb`), and without that a capsule.

**What the USD should contain:** a skinned mesh with at least `idle`, `talk` and `think` clips, plus a few emotes. A
head bone matching `/head$/i` lets speech nod along with the token stream. Viseme blendshapes are optional and only
matter once there's a TTS voice to sync them to.
