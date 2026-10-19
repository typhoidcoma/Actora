# People: friends, messages, her receptionist

Handles, friends, direct messages, and an assistant mode where friends can talk to the user's agent. Protocol is
Aelora's (`H:\Projects\Aelora\docs\SOCIAL.md`, `SOCIAL-CLIENT.md`). Full reference: [social.md](../social.md).

## The rule that shapes everything

**Nothing anyone wrote reaches her unless the user asks.** On her own she gets counts and names
(`waitingSummary`). When asked, she reads one conversation with Aelora's `read_messages`; replies she drafts arrive as
a `send_dm` approval the user must tap. What a friend wrote is untrusted, and can't approve anything.

Any change that puts message text, previews, settings or thread contents into `client_state`, `/api/llm`, the
priority list, pills or logs breaks this rule. Don't.

## Where things are

| What                                                  | File                       |
| ----------------------------------------------------- | -------------------------- |
| Protocol: connect, every request, `handleSocialFrame` | `src/social/social.ts`     |
| Types (`Thread`, `DmMessage`, `SHAREABLE`, …)         | `src/social/types.ts`      |
| Store + pure helpers (unread, `isMine`, names)        | `src/stores/social.ts`     |
| Home message card                                     | `src/social/homeCard.ts`   |
| Profile pictures (crop, upload, URL)                  | `src/social/pictures.ts`   |
| Panel, thread, profile, receptionist settings         | `src/ui/people/*`          |
| Mock (Sam, Priya, Jo, a handle to claim)              | `src/aelora/mockSocial.ts` |

## Rules

- **Messages are keyed by seq, never appended.** The same message arrives as `dm.sent`, `dm.message` and in
  `dm.synced`; `withMessage` is idempotent and an older copy never overwrites a newer edit.
- **Unread is recomputed, never incremented** (`baselineOf` + `recount`).
- **`isMine` checks `senderKind === 'human'`.** A receptionist reply carries its owner's `senderId`.
- **People stays open until the user closes it.** No idle return home, no chat pulled over it
  (`idleHome.ts`, `autoChat.ts`, `herOpenChat`).
- Background loads fail silently; user actions toast; form errors show inline (`errors[form]`).
- Assistants are never mistaken for people: `AssistantAvatar` carries "AI", labels say "(AI)".

## Check

`src/social/social.test.ts` covers most of it (and asserts nothing from People is in client state);
`pictures.test.ts`, `idleHome.test.ts`, `peek.test.ts`. In the mock, Sam writes back and has an assistant. The 3D app
reuses the 2D panel in its overlay, so check it there too.
