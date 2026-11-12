import { useState } from 'react'
import { refreshGifts } from '../../gifts/gifts'
import type { Gift } from '../../gifts/gift'

/**
 * Her picture. If it won't load (its address only lasts a week), a soft blank
 * holds its place and the list is fetched again for a fresh address.
 */
export function GiftImage({
  gift,
  className = '',
  fit = 'cover',
  eager = false,
  style,
}: {
  gift: Gift
  className?: string
  fit?: 'cover' | 'contain'
  eager?: boolean
  style?: React.CSSProperties
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === gift.url) return <div aria-hidden className={`aspect-square bg-text/8 ${className}`} style={style} />
  return (
    <img
      src={gift.url}
      alt={gift.note ? `Her gift: ${gift.note}` : 'Her gift'}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => {
        setFailed(gift.url)
        refreshGifts()
      }}
      className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
      style={style}
    />
  )
}
