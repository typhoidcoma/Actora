# Check-ins, the Vault, focus sessions, offline capture

Smaller features around the main screen. Full reference: [services.md](../services.md) section 6.

| Feature         | Files                                                                                                  | What it is                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Check-ins       | `src/checkins/checkins.ts`                                                                             | Her now-and-then "how's it going?" while the user is around but quiet                      |
| The Vault       | `src/stores/vault.ts`, `src/ui/cards/VaultPanel.tsx`                                                   | What she remembers about the user: browse, search, add, forget, hide from the receptionist |
| Focus sessions  | `src/stores/session.ts`, `src/ui/SessionChip.tsx`, `startFocus` / `endFocus` in `src/aelora/client.ts` | A timer chip for what the user is working on                                               |
| Offline capture | `src/stores/captures.ts`, `captureTask` in `src/aelora/client.ts`                                      | Task thoughts kept locally until the socket is back                                        |
| Task briefs     | `src/tasks/brief.ts`                                                                                   | A short brief she writes for a task with no notes                                          |

## Rules

- **Check-ins are rare and polite.** All gates must hold (home screen, visible, idle 2–30 min, 08:00–21:00, under 4 a
  day, …) and "Not now" doubles the gap. Don't loosen the gates without the user asking. They go over `system_chat`
  like the welcome, so they never enter the thread history.
- **Vault edits are optimistic** and roll back on failure. Categories have a fixed order and plain names
  (`CATEGORIES`); unknown ones fall into Context.
- **Captures are per user.** `flushCaptures()` adds only that user's thoughts, skipping titles already on the list.
- Per-user `localStorage` keys carry their owner; a different user on the same browser never sees the last one's
  state.

## Check

`src/checkins/checkins.test.ts` (dev: `__actora.checkin()` sends one now), `src/stores/vault.test.ts`,
`src/stores/session.test.ts`, `src/stores/captures.test.ts`, `src/tasks/brief.test.ts`.
