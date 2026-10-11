import { useEffect, useMemo } from 'react'
import { Lighting } from './room/Lighting'
import { roomMaterials } from './room/materials'
import { Room } from './room/Room'
import { Sky } from './Sky'

/** Where she lives: the weather outside the windows, the room, and its light. */
export function Environment() {
  const mat = useMemo(() => roomMaterials(), [])
  useEffect(
    () => () => {
      for (const m of Object.values(mat)) ('dispose' in m ? m : m.material).dispose()
    },
    [mat],
  )
  return (
    <>
      <Sky />
      <Room mat={mat} />
      <Lighting mat={mat} />
    </>
  )
}
