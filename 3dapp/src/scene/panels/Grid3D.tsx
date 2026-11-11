import { useState } from 'react'
import { usePriorities } from '@actora/priority/usePriorities'
import { usePendingAction, type PendingAction } from '@actora/stores/pending'
import { useFocused } from '../../look/focus'
import { useStage } from '../../look/layout'
import { usePresence } from '../../look/motion'
import { FindsCard3D } from './FindsCard3D'
import { ListCard3D } from './ListCard3D'
import { PriorityCard3D } from './PriorityCard3D'
import { ChatsCard3D } from './ChatsCard3D'
import { PendingCard3D } from './PendingCard3D'
import { homeSlots, useChatsCard, type HomeSlot } from '@actora/social/homeCard'

/** The 2D Grid's slots (shared rules): two ranked priorities, Chats top right, calm list summaries in any gap. */
function useSlots(): HomeSlot[] {
  // On the phone strip the cards are one column, as 2D's stack.
  const portrait = useStage().portrait
  return homeSlots(usePriorities(), useChatsCard(), portrait)
}

/**
 * Box 4: what waits for the user's OK while there is something, else the finds.
 * The one leaving eases out as the other comes in; the last pending action is
 * held while its card eases out, so it never empties mid-exit.
 */
function Box4({ focused }: { focused: boolean }) {
  const pending = usePendingAction()
  const [shown, setShown] = useState<PendingAction | undefined>(pending)
  if (pending && pending !== shown) setShown(pending)
  return (
    <>
      <FindsCard3D corner={3} present={!focused && !pending} />
      {shown && (
        <PendingCard3D
          key={shown.id}
          pending={pending ?? shown}
          corner={3}
          present={!focused && !!pending && pending.id === shown.id}
          onGone={() => setShown(undefined)}
        />
      )}
    </>
  )
}

/**
 * The 2D Grid around her: three slots (Chats among them), then box 4 in the fourth corner.
 * Cards glide to a new corner when the ranking changes and ease out when they
 * drop off; all of them step back while something is open (focus mode).
 */
export function Grid3D() {
  const focused = useFocused()
  const [list, done] = usePresence(useSlots(), (s) => s.key)
  return (
    <>
      {list.map((p) =>
        p.item.type === 'item' ? (
          <PriorityCard3D key={p.key} item={p.item.item} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ) : p.item.type === 'chats' ? (
          <ChatsCard3D key={p.key} card={p.item.card} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ) : (
          <ListCard3D key={p.key} tile={p.item.tile} corner={p.index} present={p.present && !focused} onGone={() => done(p.key)} />
        ),
      )}
      <Box4 focused={focused} />
    </>
  )
}
