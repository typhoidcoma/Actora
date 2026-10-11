import { usePriorities } from '@actora/priority/usePriorities'
import { usePresence } from '../../look/motion'
import { FindsCard3D } from './FindsCard3D'
import { PriorityCard3D } from './PriorityCard3D'

/**
 * The 2D Grid around her: three ranked priority cards in the first three
 * corners, the finds card in the fourth. Cards glide to a new corner when the
 * ranking changes, and ease out when they drop off.
 */
export function Grid3D() {
  const [list, done] = usePresence(usePriorities().slice(0, 3), (i) => i.key)
  return (
    <>
      {list.map((p) => (
        <PriorityCard3D key={p.key} item={p.item} corner={p.index} present={p.present} onGone={() => done(p.key)} />
      ))}
      <FindsCard3D corner={3} />
    </>
  )
}
