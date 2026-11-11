# Home screen: cards, box 4, her line and the pills

How Actora's home screen gets its data from Aelora, decides what to show, lets
the agent (Wendy) shape it, and reports it back to her. The 2D app (`src/`) owns
all the logic; the 3D app (`3dapp/`) reuses it through `@actora/*` and only
draws it differently. See `docs/agent-ui.md` for the agent's view of the UI.

## Layout

```
 her line (AgentLine)             what she is saying right now
 +-----------------+-----------------+
 | slot 1          | slot 2          |  ranked priorities (any kind),
 +-----------------+-----------------+  a DM card, or calm list cards
 | slot 3          | box 4           |  box 4: pending approval, else finds
 +-----------------+-----------------+
 pill rail (OptionRail)            tap targets for the current context
```

| Piece               | 2D                                 | 3D                                                                   |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Her line            | `src/ui/AgentLine.tsx`             | `3dapp/src/scene/panels/AgentLine3D.tsx` (caption over her head)     |
| Grid + slot picking | `src/ui/Grid.tsx` (`useSlots`)     | `3dapp/src/scene/panels/Grid3D.tsx` (its own `useSlots`, same rules) |
| Priority card       | `src/ui/cards/PriorityCard.tsx`    | `PriorityCard3D.tsx`                                                 |
| DM card             | `src/ui/cards/MessageCard.tsx`     | `MessageCard3D.tsx`                                                  |
| List summary card   | `CardShell` + `src/ui/tiles/*Face` | `ListCard3D.tsx`                                                     |
| Box 4               | `FindsCard` / `PendingCard`        | `Box4` in `Grid3D.tsx`: `FindsCard3D` / `PendingCard3D`              |
| Pill rail           | `src/ui/OptionRail.tsx`            | same component, mounted in `3dapp/src/dom/Overlay.tsx`               |

Notes:

- Both grids build slots from the same inputs: `usePriorities()` (merged top 3),
  `useMessageCard()` and `cardsWithMessage()`, then fill with list cards.
  If you change slot rules, change both `useSlots` functions.
- 2D: on narrow screens (`m.stack`) the grid becomes one column, most important
  first. The open card unmounts so its `layoutId` can morph into the panel.
- 3D: `Box4` cross-fades. It holds the last `PendingAction` in local state while
  `PendingCard3D` eases out (`onGone`), so the card never empties mid-exit.
  Cards use `usePresence` to glide between corners and ease out when dropped.

## Data loading and live frames

All home data lives in one entity store, `src/stores/entities.ts`, filled by
`src/aelora/router.ts` (`bootstrap`, `routeFrame`, `routeEvent`).

On `hello` the client sends `tz.set` and `client_state`, then these requests
(`src/aelora/request.ts`: correlated by reply type, one in flight per type,
12 s timeout; bootstrap retries at 0, 2 and 6 s):

| Send                                                         | Reply frame               | Field                           |
| ------------------------------------------------------------ | ------------------------- | ------------------------------- |
| `{type:'task.list'}`                                         | `task.list`               | `tasks`                         |
| `{type:'goal.list'}`                                         | `goal.list`               | `goals`                         |
| `{type:'notification.list', deliveredOnly:false}`            | `notification.list`       | `notifications`                 |
| `{type:'calendar.list', from, to}` (today 00:00 to +14 days) | `calendar.list`           | `events` (expanded occurrences) |
| `dm.threads`, `dm.sync`                                      | `dm.threads`, `dm.synced` | `threads` (social store)        |

Live updates:

| Frame                                                                    | Read                                                        | Action                                                               |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `task.created` / `.updated` / `.completed`                               | `f.task`                                                    | upsert                                                               |
| `goal.created` / `.updated`                                              | `f.goal`                                                    | upsert                                                               |
| `notification.created` / `.marked`                                       | `f.notification`                                            | upsert                                                               |
| `calendar.created` / `.updated`                                          | `f.event`                                                   | upsert; recurring (`rrule`/`is_recurring`) refetches `calendar.list` |
| `task.deleted`, `goal.deleted`, `calendar.deleted`                       | `f.id`                                                      | remove                                                               |
| `{type:'event', event:'task'\|'goal'\|'notification'\|'calendar', data}` | `data.<kind>`; `data.type` ending `:deleted` uses `data.id` | same                                                                 |
| `{type:'event', event:'pending_action', data}`                           | `id`, `type`, `kind`, `summary`                             | `pending.apply` (box 4)                                              |

Rules: upsert keeps the copy with the newer `updated_at`; events are keyed per
occurrence as `id@occurrence_start`; frames for another user (admin sockets)
are dropped (`src/aelora/owner.ts`); the store clears on disconnect.

## Scoring

`scoreItems(entities, now)` in `src/priority/score.ts` is pure. It runs again
every 30 s so time-based text stays true. A `null` score means "not a candidate".

```ts
interface PriorityItem {
  key: string // `${kind}:${id}`
  kind: 'task' | 'goal' | 'event' | 'notification'
  id: string
  title: string
  meta: string // "in 36 min · Studio"
  why: string // "Starting soon", "Overdue", "New reminder"
  score: number // 0-100
  urgency: number // score / 100, drives the colour
  occurrence?: string
  primary?: { label: string; act: LocalAct } // e.g. "Got it" -> markRead
}
```

| Kind                 | Condition                                     | Score                  | Why                                   |
| -------------------- | --------------------------------------------- | ---------------------- | ------------------------------------- |
| Event                | Happening now (not all-day)                   | 100                    | Happening now                         |
|                      | Starts within 180 min                         | 95 - min/3             | Starting soon (<= 30 min) / Coming up |
|                      | Later today                                   | 40                     | Later today                           |
|                      | Ended, or another day                         | none                   |                                       |
| Task                 | Overdue                                       | min(94, 80 + 2 x days) | Overdue                               |
|                      | Due today (in progress / todo)                | 70 / 60                | Due today                             |
|                      | Due tomorrow                                  | 30                     |                                       |
|                      | No due date (active / todo)                   | 25 / 15                |                                       |
|                      | Done or skipped                               | none                   |                                       |
| Notification         | Unread, delivered < 60 min ago                | 72                     | New reminder                          |
|                      | Unread, older                                 | 50                     | Still unread                          |
|                      | Read, or scheduled for later                  | none                   |                                       |
| Goal                 | Active day/week goal, < 30% of its tasks done | 35                     |                                       |
| DM (not ranked here) | Newest unread unmuted thread < 10 min         | 82                     |                                       |
|                      | 10-60 min (linear)                            | 82 -> 40               |                                       |
|                      | Older                                         | 30                     |                                       |

- Sort by score, ties by title; keep the first of each `key` (a recurring
  series shows its next occurrence).
- `topWithVariety`: at most 2 of one kind in the top 3.
- A notification with `origin_type: 'assistant'` is labelled "Message for you".
- DM scoring lives in `messageCard()` in `src/stores/social.ts`, deliberately
  outside `scoreItems`, because the ranked list goes to Wendy and nothing from
  People ever does.

## Merge, DM card, list fill

`mergePriorities(local, agent, pushed, n = 3)` in `src/stores/priority.ts`:

1. Pushed entries (`priorities.set`, while not expired), then agent re-rank
   entries. Each is looked up in the live local list, so a key that is done,
   read or past vanishes at once. Her `why` replaces the local one
   (`whyFrom: 'agent'`).
2. Remaining slots filled by `topWithVariety` over the unused local items.

`usePriorities()` (`src/priority/usePriorities.ts`) wires this to the stores.

Then, at display time:

- `cardsWithMessage(ranked, card)` in `src/social/homeCard.ts` inserts the DM
  card before the first item scoring strictly lower (ties keep the item ahead)
  and cuts to 3. The card shows counts and time only, never message text.
- `useSlots` fills empty slots with list cards in `FILL_ORDER`
  (calendar, tasks, inbox, goals). First pass skips lists whose kind already
  has a card; a second pass allows them if slots are still empty.
- Slot 4 is always box 4.

## Agent influence on the cards

| Mechanism                  | Where                                   | Details                                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priorities.set` ui_action | `runUiAction` in `src/aelora/router.ts` | Up to 3 `{kind, id, why}`; only items that exist; `why` cut to 60 chars; pinned 30 min (`priorityStore.push`). Empty list clears.                                                                                                                       |
| Re-rank over REST          | `src/priority/rank.ts`                  | Top 8 local candidates to `POST /api/llm` (`json:true`, `maxTokens:250`, `context:{profile:true}`), parses `{top:[{key, why}]}`; known keys only, max 3. Debounce 2 s, at most once per 2 min, skipped under 2 candidates, cached by candidate key set. |
| Entity changes             | entity frames                           | When she creates/completes a task or marks a reminder read, the frames re-score the grid.                                                                                                                                                               |

ui_actions arrive as `{type:'event', event:'agent_command', data:{command:{type:'ui_action', action, args}}}`.
Every action she may call must be listed in `AVAILABLE_ACTIONS` (`src/aelora/actions.ts`), which
is sent in `client_state.ui.availableActions`.

## Box 4

Box 4 shows the newest pending approval if there is one, otherwise fun finds.

**Pending approvals** (`src/stores/pending.ts`): Aelora's gated tools emit
`pending_action` events (`created`, `retryable`, `done`, `failed`,
`discarded`). `pending.apply` keeps them in `items`; `waiting()` returns them
newest first, dropping those older than a day. `usePendingAction()` gives the
one box 4 shows. `KINDS` maps `kind` (`send_email`, `send_invite`, `trash`, ...)
to a label, a "yes" word and a done toast. The buttons never act directly:
`approvalOptions()` builds answer pills ("Send it" / "Change it" / "Discard")
whose `say` text names the action id, because the server only executes on
approval in a later user turn.

**Finds** (`src/finds/finds.ts`): filled by the `finds.set` ui_action (up to 6
`{title, blurb, why, url, image, source, tag}`). `startFinds` asks once a day by
sending `FIND_DIRECTIVE` as a `chat` into a dedicated "Fun finds" thread whose
`token`/`done` frames are kept out of the user's chat (`handleFindsFrame`). If
no `finds.set` lands within 1.5 s of `done` (`SET_GRACE_MS`), links are parsed
out of her reply (`parseFinds`). Stored per user and per day; `unseenCount`
drives the badge; `hunt()` re-runs it (also the `finds.refresh` action).

## Her line

`src/ui/AgentLine.tsx` (3D: `AgentLine3D.tsx`) shows one thing, chosen from
`useAgent().line` (`src/stores/agent.ts`):

| `line`     | Shows                                                                                                  | Set by                 |
| ---------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| `greeting` | Her welcome (gone once spent)                                                                          | `agent.showGreeting()` |
| `reply`    | Thinking, then the live tail while streaming, then the first sentence of her last reply (or the error) | `agent.showReply()`    |
| `notice`   | "Reminder" kicker + a notification she is passing on                                                   | `agent.showNotice()`   |
| `message`  | "Actora" kicker + an app note (install steps, push results)                                            | `agent.showMessage()`  |

Connection problems override all modes. The line fades after 10 s of no change
unless it holds (live text, thinking, a reminder, a check-in, a dead connection).
On phones it steps back while a panel is open.

**One rule:** whatever you just asked shows on her line, wherever you asked
from. `say()` in `src/options/run.ts` always calls `agent.showReply()` first.
If you asked from inside a panel (list, item, vault...) with the chat closed,
it also opens the chat so her words are visible. A large question opens the
chat straight away unless `sayPolicy.openChatForLargeQuestions` is false (the
3D app sets that in `3dapp/src/main.tsx`). Every pill, voice transcript and
retry goes through `say()`; do not call `chat()` directly from UI code.

## The pills

### Option shape (`src/options/types.ts`)

```ts
interface Option {
  id: string
  label: string // shortLabel(): cut at whole words, no ellipsis
  say?: string // sent as the user's turn ...
  act?: LocalAct // ... or run locally (exactly one)
  source: 'local' | 'agent' | 'pushed'
  pin?: boolean // stays ahead of generated pills
  alt?: boolean // only fills leftover room
  answer?: boolean // a direct answer to her question: leads the row
}
```

Build them with `sayOption(label, say, source)` and `actOption(label, act)`.
Tapping runs `runOption(o)` (`src/options/run.ts`): records the tap, then
`runAct(o.act)` or `say(o.say)`. Act pills need no turn, so they work while
she is busy; say pills are disabled mid-turn.

### Three sources

| Source    | Code                                                                                                                                                                       | Notes                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local     | `localOptions(key, snapshot)` in `src/options/local.ts`                                                                                                                    | Instant, deterministic, per context key                                                                                                                                                                                                                                                     |
| Generated | `src/options/agentOptions.ts`                                                                                                                                              | `POST /api/llm` with a screen summary, last 8 turns, shown/tapped/ignored pills; `QUESTION` marker asks for 2-4 answers only. 350 ms debounce, one in flight, skipped mid-turn, honours 429 `Retry-After`, 3 min cache; late results dropped. Stored via `optionsStore.setAgent(key, ...)`. |
| Pushed    | `options.set` in `runUiAction` (router); `[label](say:...)` links stripped from her text in `src/aelora/chat.ts` / `src/aelora/scrub.ts`; approval pills from `pending.ts` | See below                                                                                                                                                                                                                                                                                   |

Local rules in brief: on `home`, each card yields kind-specific pills
(`cardOptions`: Prep/Remind for events, Start/Done for tasks, Got it/Later for
reminders, Next step for goals); the top card's first is pinned, cards 2-3 add
their first, the rest are `alt`. Time-of-day pills ("Move N overdue to today",
"Plan my day", "Wrap up") are pinned. Her line adds replies ("Yes please" /
"Not right now" after a question). `tile:*`, `item:*`, `chat`, `finds`,
`vault` have their own sets; an error pins "Try again".

### Pushed pills

- `options.set` reads only `options[].label` and `options[].say` (falls back
  to the label, cut to 160 chars). Keeps up to 5, needs at least 2. All become
  `answer` pills.
- Stored with `optionsStore.push(talkKey(), options)`. `talkKey()`
  (`src/ui/peek.ts`) is `'chat'` during a glance (she opened something and the
  chat is about to come back), else the current context key.
- `pushedShowsIn` (`src/stores/options.ts`) shows them in their key and, since
  home and chat show the same turn, in both `home` and `chat`.
- They last until the next turn starts: `agentOptions.ts` calls
  `optionsStore.clearPushed()` when `awaitingTurn` goes true. Not on tokens,
  not on screen changes, because with Aelora's inline UI actions `options.set`
  often lands after a `chat.open` or glance already changed the screen.
- `useOptions` (`src/options/useOptions.ts`) prepends `approvalOptions()` for
  the newest pending action to the pushed list, in every context.

### Merge and staleness (`src/stores/options.ts`)

`mergeOptions(local, generated, pushed, max = 6, stale)`:

1. Housekeeping acts (enable reminders, install help, "Not now") go last.
2. If 2+ pushed answers exist, generated pills and local say pills drop; local
   act pills stay.
3. Order: answers; pushed + generated (leaving room for up to 2 local acts);
   local acts and pinned; the rest of pushed + generated; local say pills.
4. De-duplicate on label and say, ignoring case and punctuation.
5. Stale pills drop: tapped in the last 30 min (`TAPPED_REST_MS`), or shown 4
   times in 2 h (`SHOWN_RESET_MS`) without a tap. They come back if fewer than
   3 would show.

### Context keys

`contextKeyOf(state)` in `src/stores/ui.ts`, first match wins:

```
chat -> vault -> people -> finds | find:<id> -> item:<kind>:<id> -> tile:<tasks|calendar|goals|inbox> -> home
```

The key is also `client_state.focus` and `screen.context`. `people` gets no
pills at all, so nothing private reaches a prompt.

### Layout (`src/ui/OptionRail.tsx`, `src/options/slots.ts`)

Fixed boxes on every screen, never free-sized chips, so the rail never changes
size or moves what's around it. Wide screens: a 3x2 grid (6 slim one-line
boxes, 30 px) the width of the message box, under it on home. Phones: a 2x2 grid; hidden while the keyboard
is up or the chat is typing. Each option keeps its box as the list changes and
only the words in a changed box cross-fade; empty boxes shimmer while her options
load, and stay as invisible space where there are none (People). While the mic is
on, one "Listening..." box fills the grid. Act pills are slightly bolder. The rail reports the labels it
actually shows with `optionsStore.setVisible(key, labels)`.

## What goes back to Aelora

`sendClientState` in `src/aelora/router.ts` sends the whole `ui` object each
time (the server replaces its copy, and a frame without `availableActions`
would get every action refused):

```jsonc
{ "type": "client_state",
  "focus": "home",
  "ui": { "client": "actora", "availableActions": [...], "animations": [...],
    "screen": {
      "context": "home",
      "priorities": [ { "key": "event:evt_123", "title": "Design sync", "why": "Starting soon" } ],
      "box4": { "type": "fun finds", "open": false, "picked": null, "count": 4, "unseen": 2,
                "items": [ { "id": "...", "title": "..." } ] },
      "pending": [ { "id": "pa_1", "kind": "send_email" } ],
      "pills": [ "Prep: Design sync", "Plan my day", "Got it: Call Sam" ],
      "people": { "open": false, "unread": 2, "from": [ { "name": "Sam", "count": 2 } ], "requests": 1 }
      // ... plus greeting, acks, open list rows, vault, etc. from screen()
    } },
  "timestamp": "..." }
```

`priorities`, `box4`, `pending` and `pills` come from `homeScreen()` in the
router. Pills are labels only, in display order, never the hidden `say` text,
so she can follow "the second one" and avoid repeating a pill. `people` is
counts and names only.

When it is sent (`src/aelora/client.ts`):

- On `hello`, and immediately on UI changes (focus, chat open, selection,
  people view, DM thread).
- The `homeScreen` watcher: subscribes to `useEntities`, `usePriorityStore`,
  `useFinds`, `usePending` and `useOptionsStore.visible`. After
  `HOME_SETTLE_MS` (1 s) of quiet it compares `JSON.stringify(homeScreen())`
  with the last sent signature and resends only if it changed. A 60 s interval
  catches cards that change with the clock alone.
- Social waiting summary changes resend after 800 ms.

If you add a field to `homeScreen()`, also subscribe to its store in that
watcher, or Wendy will talk about a stale screen.

## Recipes

### Add a new card kind

1. Add the entity to `src/stores/entities.ts` and its load request to
   `bootstrap`, plus live frames in `routeFrame` / `routeEvent`
   (`src/aelora/router.ts`; wire types in `src/aelora/protocol.ts`).
2. Extend `PriorityItem['kind']` and add a scoring branch in
   `src/priority/score.ts`. Return `null` for anything not worth showing.
   Keep it pure on `(entities, now)`.
3. Map the kind to a list in `KIND_LIST` in both `src/ui/Grid.tsx` and
   `3dapp/src/scene/panels/Grid3D.tsx` (add a `TileId`/list if needed, and to
   `FILL_ORDER`).
4. Render it: add an entry to the `KIND` map in `src/ui/cards/kinds.ts` (label, colour) used by `PriorityCard` / `PriorityCard3D`; check both for
   any kind-specific meta or primary action.
5. Let `priorities.set` accept it: `ITEM_KINDS` and `itemExists` in the router.
6. Add pills for it in `cardOptions` (`src/options/local.ts`) and an
   `item:<kind>:<id>` branch in `item()`.
7. Tests in `src/priority/priority.test.ts`.

Something that must not reach Wendy (like DMs) should not go through
`scoreItems`; join it at display time like `cardsWithMessage`.

### Add a new local pill

1. Find the context function in `src/options/local.ts` (`home`, `moments`,
   `tile`, `item`, `chat`, `finds`, or `forContext` for a new key).
2. Return `sayOption(label, sayText)` for something to ask her, or
   `actOption(label, act)` for a local action. Set `pin: true` to keep it ahead
   of generated pills, `alt: true` to only fill leftover room.
3. For a new action: add a variant to `LocalAct` in `src/options/types.ts` and
   a `case` in `runAct` in `src/options/run.ts` (call the client helper in
   `src/aelora/client.ts`; never send a chat turn from an act).
4. Keep labels short (`shortLabel` cuts at whole words). Add a case to
   `src/options/options.test.ts`.

### Add an agent ui_action

Add a `case` to `runUiAction` in `src/aelora/router.ts`, validate `args`
against what exists, add the name to `AVAILABLE_ACTIONS` in `src/aelora/actions.ts`, and describe it in
`docs/agent-ui.md`.

## File index

| What                             | File                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Grid (2D / 3D)                   | `src/ui/Grid.tsx`, `3dapp/src/scene/panels/Grid3D.tsx`                                                                               |
| Scoring                          | `src/priority/score.ts`                                                                                                              |
| Merge, agent pin                 | `src/stores/priority.ts`, `src/priority/usePriorities.ts`                                                                            |
| Re-rank                          | `src/priority/rank.ts`                                                                                                               |
| DM card                          | `src/stores/social.ts` (`messageCard`), `src/social/homeCard.ts`                                                                     |
| Box 4                            | `src/stores/pending.ts`, `src/finds/finds.ts`                                                                                        |
| Her line                         | `src/ui/AgentLine.tsx`, `src/stores/agent.ts`, `src/options/run.ts` (`say`)                                                          |
| Pills                            | `src/options/{types,local,agentOptions,useOptions,run,slots}.ts`, `src/stores/options.ts`, `src/ui/OptionRail.tsx`, `src/ui/peek.ts` |
| Bootstrap, routing, client_state | `src/aelora/router.ts`, `src/aelora/client.ts`, `src/aelora/request.ts`                                                              |
| Tests                            | `src/priority/priority.test.ts`, `src/finds/finds.test.ts`, `src/social/social.test.ts`, `src/options/options.test.ts`               |
