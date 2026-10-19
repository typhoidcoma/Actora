# Chat, turns and her line

A turn is: the user says something → `chat` frame → her reply streams (`token`, `tool.progress`) → `done` or `error`.
Her first words show on her line over the cards; the whole reply lives in the chat sheet. Full reference:
[architecture.md](../architecture.md) ("The chat state machine"), [home-screen.md](../home-screen.md) ("Her line").

## Where things are

| What                                                        | File                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| Turn state machine, streaming, emoji ack, greeting stream   | `src/aelora/chat.ts`                                    |
| The user's own thread (one per user, remembered)            | `src/aelora/mainThread.ts`                              |
| Tool steps in words ("Reading your messages")               | `src/aelora/activity.ts`                                |
| Leaked tool syntax, written actions, `[label](say:…)` links | `src/aelora/scrub.ts`                                   |
| Her welcome (facts → directive, over `system_chat`)         | `src/aelora/greeting.ts`                                |
| `say()`: the only way UI code sends a turn                  | `src/options/run.ts`                                    |
| Agent state: phase, line, reply, mood, reaction             | `src/stores/agent.ts`                                   |
| Her line / chat sheet / activity trail                      | `src/ui/AgentLine.tsx`, `ChatSheet.tsx`, `Activity.tsx` |
| When the chat opens on its own / goes back home             | `src/ui/autoChat.ts`, `src/ui/idleHome.ts`              |
| Glances (she opens something while you chat)                | `src/ui/peek.ts`                                        |

## Rules

- **UI code sends through `say(text)`, never `sendChat()`.** `say()` shows the turn on her line first and opens the
  chat when you asked from inside a panel. Pills, voice and retries all go through it.
- **One turn at a time.** `sendChat` refuses while a turn is in flight; say-pills are disabled mid-turn.
- **Text first.** Never delay `agent.showReply()`, tokens or the chat opening for an animation (hard rule 2).
- **`done.text` is the truth.** Streaming text is a preview; the reply is replaced by `done.text`, scrubbed.
- **Store the scrubbed reply, keep the raw one private.** Leaks can be split across tokens, so scrub the whole.
- **The turn backstop is 250 s** (`TURN_TIMEOUT_MS`): Aelora ends turns by its own 240 s deadline. Don't shorten it;
  tool-heavy turns legitimately run past 3 minutes.
- **The emoji opening her reply is her "got it"** on the user's message (`splitAck`), not part of her text.

## Recipes

**Word a new tool step.** Add the tool name to `describeTool()` in `activity.ts` (icon + present-tense words in plain
language, "Checking your calendar"). Screen actions get words from `describeUiAction()`. Test in
`src/aelora/activity.test.ts`.

**A new leaked syntax shows in her replies.** Add the pattern to `scrubToolLeaks` (handle a partial call at the end of
a stream with `streaming = true`) and a case to `src/aelora/scrub.test.ts`. `[scrub] leak survived` in the console
means one got through.

**Change when the chat opens by itself.** `autoChat.ts` (her replies) and `sayPolicy` in `run.ts` (long questions).
Respect People: replies never pull the chat over People (`docs/principles.md`). The 3D app has its own timing in
`3dapp/src/look/longAnswers.ts` and `thinkAway.ts`.

## Check

- Tests: `src/aelora/conversation.test.ts`, `scrub.test.ts`, `activity.test.ts`, `greeting.test.ts`.
- In the mock: `__actora.chat('plan my day')` from the dev console; the mock streams canned replies with tools.
- On screen: her line shows the turn wherever you asked from, and text appears at the first token.
