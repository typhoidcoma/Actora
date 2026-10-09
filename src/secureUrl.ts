/**
 * The app is served over https, so an http:// image or link Wendy found (an
 * og:image, a page) is asked for over https instead: the browser would upgrade
 * it anyway, with a Mixed Content warning. Anything else passes through as is.
 */
export function secureUrl(u: string): string
export function secureUrl(u: string | null | undefined): string | null | undefined
export function secureUrl(u: string | null | undefined): string | null | undefined {
  return typeof u === 'string' ? u.trim().replace(/^http:\/\//i, 'https://') : u
}
