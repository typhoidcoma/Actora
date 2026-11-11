# Pills (options)

Pills are what the user can say or do next, so nothing requires typing. Three sources merge into one row: **local**
(instant, deterministic), **generated** (`/api/llm` from a screen summary) and **pushed** (her `options.set`, say-links,
approval answers). Full reference: [home-screen.md](../home-screen.md) ("The pills").

## Where things are

| What                                                  | File                                            |
| ----------------------------------------------------- | ----------------------------------------------- |
| `Option` / `LocalAct` types, `sayOption`, `actOption` | `src/options/types.ts`                          |
| Local pills per context                               | `src/options/local.ts`                          |
| Generated pills                                       | `src/options/agentOptions.ts`                   |
| Tap handling: `runOption`, `runAct`, `say`            | `src/options/run.ts`                            |
| Merge, staleness, pushed lifetime                     | `src/stores/options.ts`                         |
| Context key (`home`, `chat`, `tile:tasks`, …)         | `contextKeyOf` in `src/stores/ui.ts`            |
| Rail and phone 2×2 slots                              | `src/ui/OptionRail.tsx`, `src/options/slots.ts` |

## Rules

- A pill has exactly one of `say` (sent as the user's turn) or `act` (runs locally, works mid-turn).
- **Acts never send a chat turn.** They call client helpers in `src/aelora/client.ts`.
- Pushed pills last until the user's next message, across glances and the chat opening. Don't clear them on screen
  changes.
- **People gets no pills at all**, so no conversation reaches a prompt.
- Only labels are reported to her (`screen.pills`), never `say` text.
- Labels are short; `shortLabel` cuts at whole words with no ellipsis.
- **Pills are fixed boxes, never sized to their labels.** Phones show a 2×2 grid, wide screens a 3×2 under the
  message box. A box never moves or resizes; only its words cross-fade. Don't bring back `layout` animation or
  wrapping chips: the rail changing shape reflowed every card and window around it.

## Add a local pill

1. Find the context function in `local.ts` (`home`, `tile`, `item`, `chat`, `finds`, or `forContext` for a new key).
2. `sayOption(label, text)` or `actOption(label, act)`; `pin: true` keeps it ahead of generated pills, `alt: true`
   only fills leftover room.
3. A new act: a `LocalAct` variant in `types.ts` and a `case` in `runAct`.
4. A case in `src/options/options.test.ts`.

## Check

`src/options/options.test.ts`, `label.test.ts`, `slots.test.ts`. On screen at 360 px: four boxes, no overflow; wide: six. Each
keeps its slot as the list changes, and the rail's size never changes.
