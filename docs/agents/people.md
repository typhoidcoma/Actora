# People: friends, messages, groups, her receptionist

Handles, friends, direct messages, group chats, and an assistant mode where friends can talk to the user's agent. Protocol is
Aelora's (`H:\Projects\Aelora\docs\SOCIAL.md`, `SOCIAL-CLIENT.md`). Full reference: [social.md](../social.md).

## The rule that shapes everything

**Nothing anyone wrote reaches her unless the user asks.** On her own she gets counts and names
(`waitingSummary`). When asked, she reads one conversation with Aelora's `read_messages`; replies she drafts arrive as
a `send_dm` approval the user must tap. What a friend wrote is untrusted, and can't approve anything.

Any change that puts message text, previews, settings or thread contents into `client_state`, `/api/llm`, the
priority list, pills or logs breaks this rule. Don't.

## Where things are

| What                                                  | File                                                |
| ----------------------------------------------------- | --------------------------------------------------- |
| Protocol: connect, every request, `handleSocialFrame` | `src/social/social.ts`                              |
| Types (`Thread`, `DmMessage`, `SHAREABLE`, …)         | `src/social/types.ts`                               |
| Store + pure helpers (unread, `isMine`, names)        | `src/stores/social.ts`                              |
| Home Chats box (always on home, top right)            | `src/social/homeCard.ts`, `src/ui/cards/ChatsCard.tsx` |
| Profile pictures (crop, upload, URL)                  | `src/social/pictures.ts`                            |
| Panel, thread, profile, receptionist settings         | `src/ui/people/*`                                   |
| New group, group info (members, roles, her, leave)    | `NewGroup.tsx`, `GroupInfo.tsx` in `src/ui/people/` |
| Mock (Sam, Priya, Jo, a group, a handle to claim)     | `src/aelora/mockSocial.ts`                          |
| Her gifts on the profile (shelf, viewer, chat card)   | `src/ui/gifts/*`, `src/gifts/*`, `src/stores/gifts.ts` |

## Rules

- **Messages are keyed by seq, never appended.** The same message arrives as `dm.sent`, `dm.message` and in
  `dm.synced`; `withMessage` is idempotent and an older copy never overwrites a newer edit.
- **Unread is recomputed, never incremented** (`baselineOf` + `recount`).
- **`isMine` checks `senderKind === 'human'`.** A receptionist reply carries its owner's `senderId`.
- **People stays open until the user closes it.** No idle return home, no chat pulled over it
  (`idleHome.ts`, `autoChat.ts`, `herOpenChat`).
- Background loads fail silently; user actions toast; form errors show inline (`errors[form]`).
- Assistants are never mistaken for people: `AssistantAvatar` carries "AI", labels say "(AI)". In a group too: an
  agent reply carries its owner's `senderId`, and `speakerOf` labels it "Sam's assistant (AI)", never "Sam".
- **Groups hide blocked senders on the client** (`hiddenFrom`; the server still delivers them). Keep the row, so seqs
  line up. Block is only offered in one-to-one threads: a group's `members[0]` is not "the other person".
- Group controls follow `thread.role` (owner/admin manage, only the owner sets roles). Someone who left still needs a
  name: `personIn(t, id, names)`.

- **Gifts are hers to the user, not People data.** `give_gift` arrives as `event: gift` and goes on the profile's
  shelf (fetched with `image.list {gifts: true}` when Profile first opens). Picture addresses are signed for a week:
  keep the `imageId`, never the URL; a picture that fails to load fetches the list again (`refreshGifts`).
  `client_state` carries only counts (`screen.gifts`), never her notes.

## Check

`src/social/social.test.ts` covers most of it (and asserts nothing from People is in client state);
`pictures.test.ts`, `idleHome.test.ts`, `peek.test.ts`. In the mock, Sam writes back and has an assistant. The 3D app
reuses the 2D panel in its overlay, so check it there too.
