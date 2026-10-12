/**
 * What she does while she's off working on something at home: instead of
 * standing frozen, she wanders the open floor beside her, stops to check her
 * phone, looks around, and comes back to her spot (facing you) when she's
 * done. Positions are on the floor relative to her home spot, metres.
 */

type Spot = { x: number; z: number }
type Step = { kind: 'walk'; to: Spot } | { kind: 'phone'; for: number } | { kind: 'look'; for: number }

/** The open floor to her left and behind her (the cards are to her right, the steps behind). */
const ROUTINE: Step[] = [
  { kind: 'walk', to: { x: -0.5, z: -0.45 } },
  { kind: 'phone', for: 5 },
  { kind: 'walk', to: { x: 0.2, z: -0.7 } },
  { kind: 'look', for: 2.2 },
  { kind: 'walk', to: { x: -0.3, z: 0.25 } },
  { kind: 'phone', for: 4 },
]
const HOME: Spot = { x: 0, z: 0 }
/** How long she has to be working before she gets up to do something. */
const START_AFTER = 1.8

interface WanderFrame {
  /** Walking right now (play the walk clip). */
  walking: boolean
  /** Checking her phone. */
  phone: boolean
  /** Which way she should face (radians around y), or null: face the user. */
  heading: number | null
}

export class Wander {
  private working = 0
  private step = -1
  private timer = 0
  /** Current ground speed, eased. */
  private v = 0
  private speed = 0.75
  private facing = 1

  /**
   * Advance; `pos` (her floor offset from home) is moved in place. `speed` is the
   * walk clip's ground speed (so her feet don't slide); `facing` is how well she
   * faces her heading (cos of the error), so she turns before she sets off.
   */
  update(dt: number, busy: boolean, pos: { x: number; z: number }, speed: number, facing: number): WanderFrame {
    this.speed = speed
    this.facing = facing
    this.working = busy ? this.working + dt : 0
    const away = Math.hypot(pos.x - HOME.x, pos.z - HOME.z) > 0.02

    // Not (or no longer) busy: walk back to her spot if she's wandered off.
    if (this.working < START_AFTER) {
      this.step = -1
      return away ? this.walk(dt, pos, HOME) : { walking: false, phone: false, heading: null }
    }

    if (this.step < 0) {
      this.step = 0
      this.timer = 0
    }
    const s = ROUTINE[this.step]
    if (s.kind === 'walk') {
      const f = this.walk(dt, pos, s.to)
      if (!f.walking) this.next()
      return f
    }
    this.timer += dt
    if (this.timer >= s.for) this.next()
    // Looking around: a slow turn to one side and back.
    const heading = s.kind === 'look' ? Math.sin((this.timer / s.for) * Math.PI * 2) * 0.9 : null
    return { walking: false, phone: s.kind === 'phone', heading }
  }

  private next() {
    this.step = (this.step + 1) % ROUTINE.length
    this.timer = 0
  }

  private walk(dt: number, pos: { x: number; z: number }, to: Spot): WanderFrame {
    const dx = to.x - pos.x
    const dz = to.z - pos.z
    const d = Math.hypot(dx, dz)
    if (d < 0.03) {
      pos.x = to.x
      pos.z = to.z
      this.v = 0
      return { walking: false, phone: false, heading: null }
    }
    // Ease up to pace (as the walk clip blends in), slow for the last half metre,
    // and hold while still turning to face the way.
    const want = this.speed * Math.min(1, d / 0.45 + 0.25) * Math.max(0, this.facing) ** 3
    this.v += (want - this.v) * (1 - Math.exp(-dt * 4))
    const stepLen = Math.min(d, this.v * dt)
    pos.x += (dx / d) * stepLen
    pos.z += (dz / d) * stepLen
    return { walking: true, phone: false, heading: Math.atan2(dx, dz) }
  }
}
