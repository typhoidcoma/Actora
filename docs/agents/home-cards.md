# Home cards, priorities and box 4

Home is a 2×2 grid: three ranked cards (tasks, events, reminders, goals, or an unread-message card), plus box 4 (an
approval waiting for the user's OK, else her fun finds). Full reference: [home-screen.md](../home-screen.md), which
has the scoring table and a step-by-step "Add a new card kind".

## Where things are

| What                               | 2D                                                                  | 3D                                                |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| Entities (tasks, goals, events, …) | `src/stores/entities.ts` (filled by `router.ts`)                    | same                                              |
| Local score, pure                  | `src/priority/score.ts`                                             | same                                              |
| Her re-rank over `/api/llm`        | `src/priority/rank.ts`                                              | same                                              |
| Merge (pinned, re-rank, local)     | `src/stores/priority.ts`, `src/priority/usePriorities.ts`           | same                                              |
| Unread-message card                | `src/social/homeCard.ts`, `messageCard()` in `src/stores/social.ts` | same                                              |
| Slots → cards                      | `useSlots` in `src/ui/Grid.tsx`                                     | `useSlots` in `3dapp/src/scene/panels/Grid3D.tsx` |
| Card looks                         | `src/ui/cards/*`, kinds in `src/ui/cards/kinds.ts`                  | `3dapp/src/scene/panels/*Card3D.tsx`              |
| Approvals (box 4)                  | `src/stores/pending.ts`, `src/ui/cards/PendingCard.tsx`             | `PendingCard3D.tsx`                               |
| Fun finds (box 4)                  | `src/finds/finds.ts`, `src/ui/cards/FindsCard.tsx`                  | `FindsCard3D.tsx`                                 |

## Rules

- **Two `useSlots`.** Slot rules live in both `Grid.tsx` and `Grid3D.tsx`. Change one, change the other.
- **`scoreItems(entities, now)` stays pure** and returns `null` for "not a candidate". It reruns every 30 s.
- **DMs never enter `scoreItems`.** That list goes to her. The message card is joined at display time
  (`cardsWithMessage`) and shows who, how many and when, never the text.
- **Her picks are looked up live.** A pinned or re-ranked key that's done, read or past disappears at once.
- **Approval buttons never act.** Send it / Change it / Discard are pills whose `say` names the action id; the server
  only executes on approval in a later user turn. A turn that read someone's messages can't approve anything.
- **Writes are optimistic.** Patch the store, send, restore with a toast on `null`; deletes go through `withUndo`.

## Recipes

- **New card kind:** follow [home-screen.md](../home-screen.md) "Add a new card kind" (entities → score → `KIND_LIST`
  in both grids → `kinds.ts` → `ITEM_KINDS` / `itemExists` in the router → pills in `cardOptions`).
- **New approval kind:** add it to `KINDS` in `pending.ts` (label, yes-word, done toast). Aelora sends
  `pending_action` events; nothing else on our side.
- **Tune ranking:** change scores in `score.ts` and update `src/priority/priority.test.ts`. Keep the
  at-most-two-of-a-kind rule (`topWithVariety`).

## Check

`src/priority/priority.test.ts`, `src/stores/pending.test.ts`, `src/finds/finds.test.ts`, `src/social/social.test.ts`.
On screen, in the mock: 2D and 3D side by side, with an approval waiting (box 4 switches to "Waiting for your OK") and
without; phone stack order is most important first.
