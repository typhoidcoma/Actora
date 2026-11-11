# People: friends, messages and the assistant

People is Actora's social feature: handles, friends, direct messages, and a "receptionist" mode where friends
can talk to your assistant (Wendy) instead of you. The protocol is Aelora's (`H:\Projects\Aelora\docs\SOCIAL.md`
and `SOCIAL-CLIENT.md`); this file describes what Actora implements and where.

The one rule that shapes everything: **nothing anyone wrote in People reaches Wendy unless you ask.** On
her own she gets counts and names, so she can say "Sam wrote". She doesn't get message text, settings or
thread contents. When you ask about a conversation ("what did Sam say?", or about the one you have open),
she reads it with Aelora's `read_messages` tool. When you want to answer, she drafts the reply with
`draft_message`, and it waits for your OK (see "Her help with your messages" below).

## What users get

| Feature                         | Where                                                           | Notes                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handle                          | `HandlePicker.tsx` (first run), `ProfileView.tsx` (change)      | `profile === null` means no handle yet; People shows the picker. Changing a handle keeps friends; the old one becomes free.                                                                                            |
| Display name                    | `ProfileView.tsx`                                               | `updateProfile({ displayName })`; `""` clears it. Shown everywhere via `nameOf` (display name, else `@handle`).                                                                                                        |
| Who can find you                | `ProfileView.tsx`                                               | Switches for `discoverable` (by handle) and `emailDiscoverable` (by exact email).                                                                                                                                      |
| Friends and requests            | `PeoplePanel.tsx` (`Home`, `FriendItem`)                        | Sections "Asked to be friends" (Accept / Decline), "Messages", "Friends". Outgoing requests show Cancel. Per friend: Message, and under "More": Their assistant, Unfriend, Block (two-tap `Confirm`).                  |
| Add a friend                    | `AddFriend.tsx`                                                 | Exact-handle lookup only; a miss reads "No one by that handle", the same as hidden or blocked, on purpose.                                                                                                             |
| Invites and QR                  | `AddFriend.tsx`, `Qr` in `bits.tsx`                             | "Make a link" makes a normal invite (redeeming sends a request). "Show a QR code" makes an auto-accept invite (`maxUses: 1`, `ttlHours: 24`). The QR encoder (`qrcode-generator`) is loaded only when a code is shown. |
| Blocks                          | `PeoplePanel.tsx` (`Blocked`)                                   | Block from a friend row or a conversation; unblock from the Blocked view.                                                                                                                                              |
| DMs                             | `PeopleThread.tsx` (`ThreadBody`, `ThreadComposer`)             | Optimistic send with Retry / Discard on failure, edit and delete your own messages, "Load earlier", read marking while the thread is visible and focused.                                                              |
| Unread counts                   | Menu badge (`src/ui/Menu.tsx`, `usePeopleWaiting`), thread rows | Badge = unread in unmuted threads + incoming requests.                                                                                                                                                                 |
| Mute                            | `PeopleThread.tsx`                                              | Mute / Unmute per thread. Muted threads drop out of the badge, the home card, Wendy's summary and the arrival sound.                                                                                                   |
| Talk to a friend's assistant    | Friend row "Their assistant"                                    | Shown when the friend's profile has `assistantAvailable`. Opens a thread of kind `assistant` with an intro saying it is an AI that can check free time, share what they chose, and take a message.                     |
| Your assistant ("receptionist") | `AssistantSettings.tsx` (inside Your profile)                   | Switch "Friends can message your assistant" (`assistantMode: 'friends'                                                                                                                                                 | 'off'`), vault sections she may share (`SHAREABLE`in`types.ts`), a note (`assistantAbout`), her picture, and "What friends can hear". |
| Take over                       | `ThreadComposer`                                                | In your own assistant thread (`kind: 'assistant'`, `role: 'owner'`) the composer says writing takes over: she steps back for 10 minutes (enforced server side).                                                        |
| Hide from friends               | "What friends can hear" in `AssistantSettings.tsx`              | Each previewed entry has Hide, which sets `assistant_hidden` on that item: `goal.update` for goals, `vault.update` for everything else (`hideFromAssistant` in `social.ts`).                                           |
| Profile pictures                | `PictureEditor.tsx`, `src/social/pictures.ts`                   | One for you, one for your assistant. See below.                                                                                                                                                                        |
| Group chats                     | `NewGroup.tsx`, `GroupInfo.tsx`, `PeopleThread.tsx`             | See "Group chats" below.                                                                                                                                                                                               |

### Group chats

A group is a thread with `kind: 'group'`, a `title` and up to 32 people, so history, sending, unread, sync, read
marks and push work as for a DM. Only making and running it is different (Aelora `SOCIAL.md` part 4).

- **Making one:** "New group" on People (shown once you have a friend) opens `NewGroup.tsx`: tap friends (blocked
  people are left out), and the name fills itself in from them ("You, Sam, Jo") so nothing has to be typed.
  `createGroup` sends `group.create`; the group opens when its `dm.thread` comes back, with People's list behind it.
- **Group info** (the kicker's "Group info" in a group): `GroupInfo.tsx`. Controls follow your `role`: owner and
  admins rename, add (from your friends) and remove; an admin can't remove admins or the owner; only the owner makes
  admins. Everyone gets "Bring my assistant", Mute and Leave.
- **Senders:** each run of theirs is labelled with the sender's name. Someone who left isn't in `members` any more;
  the store's `names` cache (everyone seen in a thread) keeps their name, else "Someone".
- **Blocked people stay in groups.** The server still delivers their messages, so the client hides them
  (`hiddenFrom`): the row stays, reading "Hidden message", so seqs line up. No sound plays for them. Blocking is
  offered only in one-to-one threads (in a group there's no single person to block).
- **Agents:** "Bring my assistant" sends `group.agent` (needs receptionist mode on; `assistant_off` toasts with a
  Settings button to Your profile). In a group with agents present, the composer shows "Ask Sam's assistant" pills
  (yours too, if you brought her), up to three, sent as `dm.send {agentMentions}`. Her reply is `senderKind: 'agent'`
  with the owner's `senderId`, labelled "Sam's assistant (AI)" (or "Your assistant (AI)"), never as the owner. A
  message that asked shows "Asked Sam's assistant" under it; nothing waits for a reply, since some never come.
- **Wendy:** a group shows in `screen.people` by its title, like any thread. No group view is advertised to her.

### Profile pictures

`src/social/pictures.ts`:

- Any picked image is cropped to its largest centred square (`centreSquare`), drawn at `PICTURE_PX = 256`, and
  encoded as WebP (JPEG fallback), quality 0.86. Non-images and files over 10 MB are refused (`errors.picture`:
  `not_image`, `too_big`, `no_profile`, `upload_failed`, `unreadable`).
- Uploaded to the public Supabase `avatars` bucket at `<userId>/<kind>-<random>.<ext>` (`kind` is `me` or
  `assistant`), `upsert: false`, long cache. The path is then saved with `profile.update` as `avatarPath` or
  `assistantAvatarPath`; the old file is removed afterwards. `removePicture` sends `""` and deletes the file.
- `pictureUrl(path)` builds `<supabase>/storage/v1/object/public/avatars/<path>`; `data:`, `blob:` and `http(s):`
  pass through (the mock stores pictures inline as data URLs).
- Rendering (`bits.tsx`): `Avatar` is a rounded square (corner radius 28% of size) with the picture or the
  person's initial on a steady colour. `AssistantAvatar` uses the owner's chosen picture or a default orb with
  a small "AI", so an assistant can't be mistaken for a person. In a thread, a receptionist wears its owner's
  `assistantAvatarPath` (yours from your profile, a friend's from your friends list).

## Code map

| Path                                  | Role                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/social/social.ts`                | Protocol: connect sequence, every outbound request, `handleSocialFrame` (inbound), social error routing, invite and deep-link handling.                                                                                                           |
| `src/social/types.ts`                 | `Profile`, `OwnProfile`, `FriendRow`, `BlockRow`, `Member`, `DmMessage`, `Thread`, `Pending`, `Invite`, `AssistantPreview`, `SHAREABLE`.                                                                                                          |
| `src/stores/social.ts`                | Zustand store `useSocial` and pure helpers (unit-tested).                                                                                                                                                                                         |
| `src/social/homeCard.ts`              | `useChatsCard` and `homeSlots`: the always-on Chats box on the home grid, and where it sits among the cards.                                                                                                                                      |
| `src/social/pictures.ts`              | Picture crop, upload, URL, remove.                                                                                                                                                                                                                |
| `src/ui/people/PeoplePanel.tsx`       | The panel: picks the body from guest / loading / no handle / thread / view.                                                                                                                                                                       |
| `src/ui/people/PeopleThread.tsx`      | One conversation (`ThreadBody`) and its composer (`ThreadComposer`).                                                                                                                                                                              |
| `src/ui/people/ProfileView.tsx`       | Name, handle, discoverability, your picture, then `AssistantSettings`.                                                                                                                                                                            |
| `src/ui/people/AssistantSettings.tsx` | Receptionist settings and the preview with Hide.                                                                                                                                                                                                  |
| `src/ui/people/AddFriend.tsx`         | Handle lookup, invite link, QR.                                                                                                                                                                                                                   |
| `src/ui/people/HandlePicker.tsx`      | First-run handle claim.                                                                                                                                                                                                                           |
| `src/ui/people/PictureEditor.tsx`     | Change / Remove for either picture.                                                                                                                                                                                                               |
| `src/ui/people/bits.tsx`              | `Avatar`, `StackedAvatars` (a group's face), `AssistantAvatar`, `Qr`, `Confirm`. `Switch.tsx` is the on/off row.                                                                                                                                  |
| `src/ui/people/NewGroup.tsx`          | New group: `FriendPicker` and a name filled in from the picks.                                                                                                                                                                                    |
| `src/ui/people/GroupInfo.tsx`         | A group's name, members, roles, add/remove, Bring my assistant, Mute, Leave.                                                                                                                                                                      |
| `src/aelora/mockSocial.ts`            | Mock server side (`MockSocial`, used by `src/aelora/mock.ts`): Sam (friend with an assistant who writes back), Priya (pending request), Jo, the "Climbing crew" group (Sam's assistant in it), all `group.*` frames, and a handle to claim first. |

### Store: `src/stores/social.ts`

State: `profile` (`undefined` loading, `null` no handle), `guest`, `friends`, `blocks`, `threads` by id,
`messages` as `threadId -> seq -> DmMessage`, `pending` by `clientMsgId`, `loading`, `found`/`finding`,
`invite`, `baselines`, `preview`, `names` (everyone seen in a thread, for senders who've left a group), `errors` by form (`claim`, `profile`, `find`, `invite`, `redeem`, `preview`,
`picture`). `social.reset()` empties it when a different user signs in (`src/aelora/router.ts`).

Helpers worth knowing:

- **Messages are keyed, never appended.** The same message can arrive as `dm.sent`, `dm.message` and in
  `dm.synced`; `withMessage` is idempotent and an older copy never overwrites a newer edit/delete (`newer`).
  Rendering sorts by `seq` (`messagesFor`).
- **`contiguousTop`**: the highest seq with no gap below it. Sync and read marks start from here, so a gap
  (holding 1-7 and a live 10) still gets fetched.
- **Unread = baseline + recount.** `baselineOf(thread)` records the server's `{lastSeq, unread, lastReadSeq}`
  at each `dm.threads` / `dm.thread`. `recount` recomputes (never increments): what is left of the server's
  count after reads, plus loaded messages past the baseline from someone else and not deleted. History, sync
  and out-of-order live frames therefore can't double-count.
- **`isMine(m, me)`**: `senderId === me && senderKind === 'human'`. A receptionist reply carries its owner's
  `senderId`, so `senderId` alone would put her words in the owner's mouth. `speakerOf` labels agent replies
  "Your assistant (AI)" or "Sam's assistant (AI)", and the owner stepping in by name.
- **`threadName(t)`**: assistant threads read "Sam · your assistant" (owner side) or "Sam's assistant" (friend
  side); otherwise the title, else the members' names.
- **`chatsCard(threads, now)`**: the home Chats box. Up to `CHAT_ROWS` (4) conversations, waiting ones first,
  then the most recent: name, kind, unread (0 when muted), time, faces. Never message text. `score` follows the
  newest unread, unmuted chat: 82 for ten minutes, sinking linearly to 40 at an hour, then 30 (0 with nothing
  unread). `topUnread` is that chat's id.
- **`waitingSummary(s)`**: `{unread, from: [{name, count}], requests: [name]}` for Wendy. Up to five each, muted
  threads excluded, names flattened to one line and capped at 40 characters (they come from other users).
- `totalUnread`, `incomingRequests`, `usePeopleWaiting` feed the menu badge.

## Protocol

All requests are fire-and-forget over the Aelora socket; each reply is its own frame. `socialConnected(bus)` runs
after every `hello` (`src/aelora/router.ts`): `profile.get`, `friends.list`, `dm.threads`, `friends.blocks` (for
hiding blocked senders in groups), then `dm.sync` from
each held thread's contiguous top, and any message still `sending` is retransmitted with its original
`clientMsgId` (idempotent server side). `friends.list` is also refetched on window focus, since
`friends.changed` only reaches sockets on the same server instance.

### Requests sent

| Request                                                                    | Sent by                                              | Payload                                                                                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile.get`                                                              | connect                                              |                                                                                                                                                                |
| `profile.claim`                                                            | `claimHandle`                                        | `handle` (leading `@` stripped), `displayName?`                                                                                                                |
| `profile.update`                                                           | `updateProfile`, pictures                            | any of `displayName`, `discoverable`, `emailDiscoverable`, `assistantMode`, `assistantAbout`, `assistantSharedCategories`, `avatarPath`, `assistantAvatarPath` |
| `assistant.preview`                                                        | `loadAssistantPreview`                               |                                                                                                                                                                |
| `assistant.open`                                                           | `openAssistant`                                      | `userId` (the owner)                                                                                                                                           |
| `goal.update` / `vault.update`                                             | `hideFromAssistant`                                  | `id`, `patch: { assistant_hidden }`                                                                                                                            |
| `friends.list`, `friends.blocks`                                           | connect, focus, after changes                        |                                                                                                                                                                |
| `friends.find`                                                             | `findHandle`                                         | `handle` (lowercased, no `@`)                                                                                                                                  |
| `friends.request` / `friends.remove` / `friends.block` / `friends.unblock` | friend actions                                       | `userId`                                                                                                                                                       |
| `friends.respond`                                                          | Accept / Decline                                     | `userId`, `accept`                                                                                                                                             |
| `friends.invite.create`                                                    | `createInvite`                                       | `autoAccept`, plus `maxUses: 1, ttlHours: 24` when auto-accept                                                                                                 |
| `friends.invite.redeem`                                                    | `?invite=<token>` once a handle exists               | `token`                                                                                                                                                        |
| `dm.threads`                                                               | connect, after claim, block changes, `dm.membership` |                                                                                                                                                                |
| `dm.open`                                                                  | `openDmWith` (when no 1:1 thread exists yet)         | `userId`                                                                                                                                                       |
| `dm.history`                                                               | `openThread`, `loadOlder`                            | `threadId`, `beforeSeq?`                                                                                                                                       |
| `dm.sync`                                                                  | connect, `dm.resync`, `more` pages                   | `since: { threadId: seq }`                                                                                                                                     |
| `dm.send`                                                                  | `sendDm`, `retryDm`                                  | `threadId`, `body` (trimmed, max 4000), `clientMsgId`, `agentMentions?` (groups: up to 3 owners whose agents should answer)                                    |
| `group.create`                                                             | `createGroup`                                        | `title` (1-80), `userIds` (1-31 friends)                                                                                                                       |
| `group.add` / `group.remove`                                               | Group info                                           | `threadId`, `userIds` / `userId`                                                                                                                               |
| `group.rename` / `group.role` / `group.agent` / `group.leave`              | Group info                                           | `threadId`, plus `title` / `userId, role` / `present`                                                                                                          |
| `dm.read`                                                                  | `markRead`                                           | `threadId`, `seq` (contiguous top; sent once per position)                                                                                                     |
| `dm.edit` / `dm.delete`                                                    | bubble actions                                       | `messageId`, `body` (edit)                                                                                                                                     |
| `dm.mute`                                                                  | `muteThread`                                         | `threadId`, `muted`                                                                                                                                            |

### Frames handled (`handleSocialFrame`)

| Frame                                                     | Fields read                                  | Effect                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `profile`                                                 | `profile`                                    | Stored. First claim reloads friends and threads. Redeems a pending invite; with no handle, opens People so one can be picked. |
| `friends.list`                                            | `friends`                                    | Replaces the list.                                                                                                            |
| `friends.changed`, `.requested`, `.responded`, `.removed` |                                              | Refetch `friends.list`.                                                                                                       |
| `friends.blocked`, `.unblocked`                           |                                              | Refetch friends, blocks and threads.                                                                                          |
| `friends.blocks`                                          | `blocks`                                     | Replaces blocks.                                                                                                              |
| `friends.found`                                           | `query`, `profile`                           | Ignored unless it answers the latest lookup.                                                                                  |
| `friends.invite`                                          | `token`, `id`, `expiresAt`                   | Builds `<origin>/?invite=<token>`.                                                                                            |
| `friends.invite.redeemed`                                 | `status`, `inviter`                          | Refetch friends; toast "You and X are friends" or "Friend request sent to X".                                                 |
| `dm.threads`                                              | `threads`                                    | Replaces threads and baselines; opens a waiting deep-linked thread.                                                           |
| `dm.thread`                                               | `thread`                                     | Upserts one thread and its baseline; opens it if it answers a pending `dm.open` / `assistant.open`.                           |
| `dm.membership`, `group.removed`                          |                                              | Refetch `dm.threads`.                                                                                                         |
| `group.left`                                              | `threadId`                                   | Drops the group, its messages and anything still sending; closes it if open.                                                  |
| `dm.resync`                                               |                                              | `dm.sync` from contiguous tops.                                                                                               |
| `dm.history`                                              | `threadId`, `messages`                       | Merged; clears `loading`.                                                                                                     |
| `dm.synced`                                               | `threads[].{threadId, messages, more}`       | Merged; `more` syncs that thread again.                                                                                       |
| `dm.sent`                                                 | `clientMsgId`, `message`                     | Merged; pending bubble and timeout cleared.                                                                                   |
| `dm.message`, `.updated`, `.edited`, `.deleted`           | `message`                                    | Merged; clears a matching pending bubble. A new `dm.message` from someone else plays `message`.                               |
| `dm.read`, `dm.state`, `dm.muted`                         | `threadId`, `lastReadSeq`, `muted`           | Updates the thread and recounts unread.                                                                                       |
| `assistant.preview`                                       | `mode`, `about`, `categories`, `entries[]`   | Stored as `preview`.                                                                                                          |
| `error`                                                   | `request`, `code`, `clientMsgId`, `threadId` | Only for `profile.*`, `friends.*`, `dm.*`, `assistant.*`, `group.*` requests (else left to other handlers).                   |

Error handling (`socialError`): `guest_not_allowed` sets `guest` ("Sign in to add friends..."); `profile_required`
sets `profile: null`; a `dm.send` error fails that bubble with its code; a send with no answer in 15 s fails with
`timeout`. Form requests (`profile.claim`, `profile.update`, `friends.find`, `friends.invite.create`,
`friends.invite.redeem`, `assistant.preview`) set `errors[form]` for inline display. Other user actions toast
"That didn't go through" (or a known message for `rate_limited`, `not_found`, `social_unavailable`); background
loads (`.list`, `.blocks`, `.threads`, `.sync`, `.get`) fail silently. A `group.*` refusal toasts in plain words
(`GROUP_SAY`: `forbidden`, `group_full`, `assistant_off` with a Settings button, `not_found` also refetching threads,
`rate_limited`, `bad_request`).

### Deep links

- `?invite=<token>` is read once at load, removed from the address bar, and redeemed when a profile exists.
- `?dm=<threadId>` (or a push with a thread id) goes through `src/push/push.ts` -> `setNotificationOpener` in
  `src/ui/Stage.tsx` -> `showThread`, which opens the thread now or once `dm.threads` arrives.

## UI state

`src/stores/ui.ts`:

| Field / action                                  | Meaning                                           |
| ----------------------------------------------- | ------------------------------------------------- |
| `people: boolean`                               | People is open. Counts as a panel in `panelOpen`. |
| `dmThread: string                               | null`                                             | The conversation open inside People (null: a view).      |
| `peopleView: 'home'                             | 'add'                                             | 'blocked'                                                | 'profile'` | Which view when no conversation is open. |
| `ui.openPeople(threadId = null, view = 'home')` | Closes other panels and opens People.             |
| `ui.closePeople()`                              | Closes and resets to home.                        |
| `ui.peopleView(view)`                           | Switches view and leaves any conversation.        |
| `ui.openDm(threadId                             | null)`                                            | Opens a conversation inside People, or back to the list. |

People stays open until the user closes it:

- `src/ui/idleHome.ts`: the idle-return-home timer never closes People.
- `src/ui/autoChat.ts`: her replies don't auto-open the chat over People; they wait in her line and the chat.
- `herOpenChat` in `src/aelora/router.ts`: an agent `open_app` for the chat is ignored while People is open,
  unless the user is mid-turn with her (`awaitingTurn` or a live `turnId`).

Entry points: the menu ("People" with an `N new` hint, and "Profile" which opens the `profile` view), the menu
badge, the home Chats box, a DM push, and the "Message for you" item panel.

## What the agent knows

`client_state.ui.screen.people` is built in `src/aelora/router.ts`:

```json
{
  "open": true,
  "view": "conversation",
  "unread": 3,
  "from": [
    { "name": "Sam Rivera", "count": 2 },
    { "name": "Jo · your assistant", "count": 1 }
  ],
  "requests": ["Priya"]
}
```

- `view` is present only when open: `conversation` when a thread is open, else the `peopleView`.
- `unread`, `from`, `requests` come from `waitingSummary`. Counts and names only, never message text, settings
  or previews.
- `thread: {id, with}` is present while a conversation is open (`openThread` in `router.ts`). It holds the thread
  id and who it's with, so "what's this about?" or "reply to this" works with `read_messages` / `draft_message`.
  It never carries what anyone wrote. `src/aelora/client.ts` resends client state when `people`, `peopleView` or `dmThread`
  change, and (debounced 800 ms) when the summary's signature changes.
- **Her help with your messages** (Aelora `read_messages` / `draft_message`, Aelora PR #291):
  - She reads a conversation only when you ask, on your own access, and reading doesn't mark it read.
  - A reply she writes arrives as a `pending_action` of kind `send_dm`. It shows as "Reply ready to send" in box 4,
    with Send it / Change it / Discard on the pills (`src/stores/pending.ts`). Approving it sends the message as
    you, and it arrives back as a normal `dm.message`.
  - What a friend wrote is untrusted. A turn that read messages can't approve anything, so a message can't send
    itself.
  - Email, calendar and tasks from a message use her existing tools.
- Action `people.open` with `{view?}` of `profile`, `add`, `blocked` (anything else falls back to home), and
  `people.close` (`src/aelora/actions.ts`, handled in `router.ts`). She can open a view but can't open a
  specific conversation. The agent-facing description is in `docs/agent-ui.md`.
- The home Chats box is always on the grid (top right; on phones second, or first while a fresh message
  outranks the top card). It is joined at display time (`homeSlots` in `homeCard.ts`), not in the priority list,
  because that list is sent to Wendy. Rendered by `src/ui/cards/ChatsCard.tsx` (a row opens that conversation,
  the rest of the card opens People) and `3dapp/src/scene/panels/ChatsCard3D.tsx` (one tap target: the newest
  waiting chat, else People). Who, how many and when, never the text.
- "Message for you": when a friend leaves a message with your assistant, the server creates a notification with
  `origin_type: 'assistant'` and `origin_user_id` (mock: "Sam left you a message" in `src/aelora/mock.ts`).
  `PriorityCard.tsx` labels it "Message for you"; `ItemPanel.tsx` shows "From: Sam, via your assistant" and a
  button that opens that assistant thread ("Open conversation"), or People if that thread isn't loaded.

## Sounds

`src/sound/sound.ts` moments:

- `sent` (`swipe_01`, 0.45): `sendDm` plays it at once (shared with sending to Wendy, `src/aelora/chat.ts`).
- `message` (`select`, 0.55): a new `dm.message` from someone else (a friend or a friend's assistant), not
  deleted, unless the thread is muted or it is the open, focused conversation.

## 3D app

The 3D app (`3dapp/`) reuses the 2D People panel unchanged: `3dapp/src/dom/Overlay.tsx` lazy-loads
`@actora/ui/people/PeoplePanel` into its DOM overlay when `ui.people` is true (prefetched on idle with the
other panels). The home Chats box is `ChatsCard3D` in `Grid3D.tsx`, fed by the same
`useChatsCard` / `homeSlots`. All protocol and state code is shared through `@actora/*`.

## Tests

| File                            | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/social/social.test.ts`     | Connect sequence, resend of pending sends, invite redeemed only with a handle, guest and `profile_required`; dedupe, seq order, contiguous sync and paging, read marks, deletes; optimistic send, failure, retry, 15 s timeout, length limits; unread, mute and badge; `dm.open` flow; the Chats box and where it sits; `people.open` and nothing from People in client state; recount, owner vs friend unread for agent replies, assistant labels, `assistant.open`, preview and Hide routing, late lookups, assistant errors, `waitingSummary`. |
| `src/social/pictures.test.ts`   | Public URL and pass-through, centre crop, upload path and profile save then old-file removal, assistant field, refusals, failed upload leaves profile alone, remove.                                                                                                                                                                                                                                                                                                                                                                                |
| `src/ui/idleHome.test.ts`       | Idle-home never closes People.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/ui/peek.test.ts`           | A chat peek that leads into People (profile view) leaves People open and the chat closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/priority/priority.test.ts` | Her "open the chat" waits while People is open unless you're talking with her.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Run with `npm test` (Vitest). To try People without a second account, use the mock (`MockSocial`).
