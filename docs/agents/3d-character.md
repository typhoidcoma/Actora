# 3D character: animation, poses, models

She is a skinned model driven by the agent's state: phase → looping clip, reactions → additive emotes, procedural
poses for thinking and emoji, a wander while she works. Full reference: [3dapp/README.md](../../3dapp/README.md)
("The character", "Extra clips", "Her model").

## Where things are

| What                                                       | File                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Model URL, clip names per phase, emotes, extra clips       | `3dapp/src/character.ts`                                        |
| Loading, mixer, per-frame update, her skin                 | `3dapp/src/scene/Character.tsx`                                 |
| Phase → clip, `avatar.react` → emote, nod with the stream  | `3dapp/src/bridge/agentAnim.ts` (`AgentAnimator`)               |
| Procedural holds and emoji gestures on the Mixamo skeleton | `3dapp/src/bridge/poses.ts` (`HOLDS`, `GESTURES`, `gestureFor`) |
| Wandering and checking her phone during a turn             | `3dapp/src/bridge/wander.ts`                                    |
| How far she's wandered (read by camera, DOF, timing)       | `3dapp/src/look/her.ts` (`herOffset`)                           |
| Her body colours from mood (TSL)                           | `3dapp/src/look/skin.ts`                                        |
| Walk-in on arrival                                         | `3dapp/src/look/intro.ts`                                       |
| Stand-in model, USD → GLB                                  | `3dapp/scripts/fetch-placeholder.mjs`, `scripts/usd-to-glb.py`  |

## Rules

- **Animation never holds text back.** Her line and the chat update on the first token, whatever she's doing. The
  chat opens with her first words after a long think, not after she walks back (`look/longAnswers.ts`).
- **Clips are named after their file** and listed in `character.clips`. A clip named after a gesture (`wave`,
  `thumbsup`, …) replaces that procedural pose.
- **Mixamo skeleton.** The Xbot stand-in and Mixamo characters share it, so clips bind as they are. FBX clips:
  "Without Skin", "In Place".
- **Her materials are node materials**; her look is `skin.ts` (TSL), not a texture swap.
- Wide screens only for the wander; phones keep her still.

## Try it

`window.__actora3d.busy = true` makes her wander as if a turn were running; `hold: 'think' | 'phone'`,
`gesture: 'wave'` and `poses` try poses live (`agentAnim.ts`). `npm run placeholder` fetches the stand-in, which isn't
in git.
