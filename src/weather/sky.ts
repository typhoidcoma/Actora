import { create } from 'zustand'

// Local weather for the ambient background. Location comes from the browser
// (one permission prompt), the forecast from Open-Meteo (free, no key, CORS-open).
// Without permission or network, we fall back to the clock: day/night, clear.

export type SkyKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow'

export interface Sky {
  kind: SkyKind
  isDay: boolean
  temp: number | null
  unit: 'C' | 'F'
  source: 'live' | 'clock'
}

const CACHE_KEY = 'actora.sky.v1'
const COORDS_KEY = 'actora.coords.v1'
const FRESH_MS = 20 * 60_000

/** WMO weather interpretation codes → our seven skies. */
export function classify(code: number): SkyKind {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain' // 51–67 drizzle/rain, 80–82 showers
}

function preferredUnit(): 'C' | 'F' {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    return region === 'US' || region === 'LR' || region === 'MM' ? 'F' : 'C'
  } catch {
    return 'C'
  }
}

function clockSky(): Sky {
  const h = new Date().getHours()
  return { kind: 'clear', isDay: h >= 6 && h < 19, temp: null, unit: preferredUnit(), source: 'clock' }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

function locate(): Promise<{ lat: number; lon: number } | null> {
  const cached = read<{ lat: number; lon: number }>(COORDS_KEY)
  if (!('geolocation' in navigator)) return Promise.resolve(cached)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // ~1 km precision is plenty for weather and kinder to privacy.
        const coords = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) }
        write(COORDS_KEY, coords)
        resolve(coords)
      },
      () => resolve(cached),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60 * 60_000 },
    )
  })
}

async function fetchSky(): Promise<Sky> {
  const coords = await locate()
  if (!coords) return clockSky()
  const unit = preferredUnit()
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&current=weather_code,is_day,temperature_2m${unit === 'F' ? '&temperature_unit=fahrenheit' : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`weather ${res.status}`)
  const body = (await res.json()) as { current?: { weather_code?: number; is_day?: number; temperature_2m?: number } }
  const c = body.current
  if (!c || typeof c.weather_code !== 'number') return clockSky()
  return {
    kind: classify(c.weather_code),
    isDay: c.is_day === 1,
    temp: typeof c.temperature_2m === 'number' ? c.temperature_2m : null,
    unit,
    source: 'live',
  }
}

export const useSky = create<Sky>(() => read<{ at: number; sky: Sky }>(CACHE_KEY)?.sky ?? clockSky())

let started = false
/** Fetch now (unless cached and fresh), then every 20 minutes and on return to the app. */
export function watchSky(): void {
  if (started) return
  started = true
  const refresh = async (force = false) => {
    const cached = read<{ at: number; sky: Sky }>(CACHE_KEY)
    if (!force && cached && Date.now() - cached.at < FRESH_MS) {
      useSky.setState(cached.sky)
      return
    }
    try {
      const sky = await fetchSky()
      useSky.setState(sky)
      if (sky.source === 'live') write(CACHE_KEY, { at: Date.now(), sky })
    } catch {
      if (!cached) useSky.setState(clockSky())
    }
  }
  void refresh()
  setInterval(() => void refresh(true), FRESH_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refresh())
}
