# Her screen actions and what she sees

She drives the UI with ui_actions (`card.open`, `options.set`, `colors.set`, ...) and sees the screen through
`client_state.ui.screen`. Full reference: [agent-ui.md](../agent-ui.md) (her playbook, every action) and
[architecture.md](../architecture.md) ("How the agent drives the UI").

## Where things are

| What                                                            | File                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| The advertised catalog (`AVAILABLE_ACTIONS`), legacy names      | `src/aelora/actions.ts`                                       |
| `runUiAction`: validates and runs every action                  | `src/aelora/router.ts`                                        |
| `screen()` / `homeScreen()` / `sendClientState`                 | `src/aelora/router.ts`                                        |
| When client state is resent (watchers, debounce)                | `src/aelora/client.ts`                                        |
| Actions she wrote as text instead of calling                    | `writtenActions` in `src/aelora/scrub.ts`, run from `chat.ts` |
| Words for the step trail                                        | `describeUiAction` in `src/aelora/activity.ts`                |
| Her playbook (live copy in Aelora `persona/_clients/actora.md`) | `docs/agent-ui.md`                                            |

## Add an action

1. Name it `domain.verb` (exactly one dot) and add it to `AVAILABLE_ACTIONS`. Unadvertised actions are refused by the
   server and leak into her text.
2. Handle it in `runUiAction`. Treat every argument as missing, wrong or cut off (`looseArgs`): ids must exist
   locally (`itemExists`), strings are capped, colours are hex, numbers are clamped. Ignore what doesn't validate.
3. If it opens something while the chat is open, decide whether it's a glance (`SCREEN_MOVES` → `peekThenChat`).
4. Give it words in `describeUiAction` if it should show as a step.
5. Describe it in `docs/agent-ui.md` **and** in Aelora's playbook (Aelora change = branch + PR).
6. Tests in `src/aelora/actions.test.ts`; try it with `__actora.ui('name.verb', { ... })` in the mock.

## Add something she should see

1. Add it to `screen()` (moves with the user) or `homeScreen()` (changes on its own).
2. For `homeScreen()` fields, subscribe to the store in the watcher in `client.ts`, or she'll talk about a stale
   screen. It's compared by JSON signature and resent after 1 s of quiet.
3. Real ids, short labels. Never pill `say` text, never anything anyone wrote in People.
4. `sendClientState` always sends the whole `ui` object; a frame without `availableActions` gets every action refused.

## Don't

- Don't trust arguments because "the model wouldn't send that". It will.
- Don't make an action that needs a user gesture (mic, permissions) do it directly; push a pill the user taps
  (`voice.listen` → "Tap to talk", `push.offer`).
- Don't let her approve anything: gated tools wait for the user's tap (see [home-cards.md](home-cards.md), box 4).
