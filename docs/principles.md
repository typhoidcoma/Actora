# Design principles

These are the rules behind Actora's behaviour. Most came from using the app and finding something that felt wrong. When a
change would break one of them, the rule wins unless we decide to change the rule, and then this file changes too.

## Talking with her

**Nothing requires typing.** Every screen has pills for what you can say or do next, the mic is always one tap away, and
cards have their actions on them. Typing is there for when you want it.

**Reading beats animation.** Her words show the moment they arrive. Nothing holds text back for a walk, a camera move or a
thinking pose. Animations play alongside the text, never before it. In 3D, the chat opens with her first words after a
long think, not after she has walked back to her spot (`3dapp/src/look/longAnswers.ts`).

**One rule for her line.** Whatever you just asked shows over her head (her thinking, then her answer), wherever you asked
it from: home, the chat or a panel. The chat is a closer view of the same turn, not a separate mode
(`say()` in `src/options/run.ts`).

**She acknowledges first.** An emoji reaction lands on your message before she goes off to do something, so you know she
heard you (Aelora sends `message.react` before tool calls).

**When she's asked to change something, it changes now.** A theme or colour change applies in the same turn, even if it
looks terrible. You can always say "back to normal".

**A long think is worth watching.** In 3D, if she is still thinking a few seconds after you send from the chat, the chat
steps back so you can watch her work in the room, with her steps over her head. It comes back with her first words
(`3dapp/src/look/thinkAway.ts`).

## Who controls the screen

**What she opens while you talk is a glance.** If the chat is open and she opens a card, a list or People, it shows for 5
seconds and then the chat comes back. Touch it (tap, scroll, type, or move the pointer over it) and it becomes yours and
stays (`src/ui/peek.ts`).

**Nothing pulls you out of what you're doing.** People stays open while you use it: no idle return to home, and no jump to
the chat unless you are talking to her (`src/ui/idleHome.ts`, `src/ui/autoChat.ts`, `herOpenChat` in
`src/aelora/router.ts`).

**Her options last until your next message.** Pills she offers arrive late in her reply. They stay through glances and the
chat opening, and show on both home and chat, until you send something new (`src/stores/options.ts`).

## What she knows

**She sees what you see.** `client_state.ui.screen` describes the screen with real ids: the cards, box 4, approvals
waiting, the pills, the open list. It is resent within a second when any of it changes, not only when you move, so she
never talks about a card that has gone (`homeScreen()` in `src/aelora/router.ts`, the watcher in `src/aelora/client.ts`).

**Advertise every action, validate every argument.** `availableActions` lists everything Actora accepts. Aelora only runs
and hides advertised actions, so a missing entry shows up as raw text in her reply. Aelora passes arguments through
unchecked, so Actora checks them: real ids only, lengths capped, colours as hex.

**Private things stay private.** For People she gets counts and names ("2 from Sam", "1 friend request"), never what
anyone wrote, unless you ask her about a conversation. Then she reads that one. She answers only with a draft you
approve, and nothing a friend wrote can approve it for you. Generated pills skip the People screen entirely, so no conversation goes into a prompt. Only pill labels are
reported, never the hidden text a pill would send.

## Phones

**Design for 360 px.** The narrowest target is a Samsung S22 (360 CSS px). Everything must fit at that width with no
sideways scroll.

**The keyboard is not a layout change.** When the phone keyboard comes up, the app keeps its phone layout. Panels get the
visible height, headers slim down, and the rail and pills step aside (`src/stores/metrics.ts`).

**App mode looks like an app.** The installed app's system bars match the dark theme colour (`#191832` in
`public/manifest.webmanifest`).

## Look and feel

**Graphics are WebGPU and TSL only.** Everything drawn on the GPU (the 3D scene, her orb in 2D) runs on WebGPU with
shaders written in TSL. No WebGL, no GLSL, no fallback, and no slower paths. Without WebGPU the 3D app gives a clear
message, not a degraded scene (`3dapp/src/gpu.ts`), and the 2D orb is its CSS stand-in. Within WebGPU, use the best
technique available, such as PCSS soft shadows. `scripts/graphics-guard.mjs` enforces it
([agents/graphics.md](agents/graphics.md)).

**Small and considered.** Profile pictures are small rounded squares, cropped and resized before upload. Sounds are a
quiet, classy kit (SND Sine), on by default, with one switch in the menu.

**Sign-in is one step.** One Google sign-in also connects Calendar and Gmail. It always shows the account chooser and the
permissions screen, like the Aelora dashboard, so you can pick the account and see what you're granting.

## How we work

- **Actora:** verified changes go straight to `main`, which deploys automatically to Cloud Run.
- **Aelora:** changes go through a branch and a pull request, never straight to `main`. The Actora playbook lives in
  Aelora at `persona/_clients/actora.md`; `docs/agent-ui.md` here is its reference copy, so change both together.
- **Check it on screen before calling it done.** Run the UI headless (see `docs/development.md`), and for 3D compare
  against the 2D app.
