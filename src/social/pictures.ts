import { getSupabase, supabaseBase } from '../auth/supabase'
import { config } from '../config'
import { social, useSocial } from '../stores/social'
import { updateProfile } from './social'

/**
 * Profile pictures (Aelora docs/SOCIAL.md § Profile pictures): yours, and your
 * receptionist's. Stored in the public `avatars` bucket under your own folder,
 * small and square; the path goes on your profile with profile.update.
 */

export type PictureKind = 'me' | 'assistant'

/** Big enough for a crisp 64 px tile on a 3x screen, small enough to load at once. */
export const PICTURE_PX = 256
const MAX_UPLOAD = 10 * 1024 * 1024

/** Where a picture is served from (null until the Supabase address is known). Inline data passes through (the mock). */
export function pictureUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^(data|blob|https?):/.test(path)) return path
  const base = supabaseBase()
  return base ? `${base}/storage/v1/object/public/avatars/${path.split('/').map(encodeURIComponent).join('/')}` : null
}

/** The largest centred square of a w×h image. */
export function centreSquare(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h)
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size }
}

const field = (kind: PictureKind) => (kind === 'me' ? 'avatarPath' : 'assistantAvatarPath')

/** A 256 px square (WebP, else JPEG) from whatever image was picked. */
async function squareImage(file: Blob): Promise<{ blob: Blob; ext: 'webp' | 'jpg' }> {
  const bitmap = await createImageBitmap(file)
  const { sx, sy, size } = centreSquare(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PICTURE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, PICTURE_PX, PICTURE_PX)
  bitmap.close?.()
  const encode = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86))
  const webp = await encode('image/webp')
  if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp' }
  const jpg = await encode('image/jpeg')
  if (!jpg) throw new Error('could not encode')
  return { blob: jpg, ext: 'jpg' }
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/**
 * Set your picture (or your assistant's) from a picked file: cropped to a centred
 * square, resized, uploaded to your own folder, then saved on your profile. The
 * old one is removed afterwards. Errors go to `errors.picture`.
 */
export async function uploadPicture(file: File, kind: PictureKind): Promise<boolean> {
  social.setError('picture', null)
  if (!file.type.startsWith('image/')) return fail('not_image')
  if (file.size > MAX_UPLOAD) return fail('too_big')
  const profile = useSocial.getState().profile
  if (!profile) return fail('no_profile')
  try {
    const { blob, ext } = await squareImage(file)
    // The mock has no storage: the picture travels inline.
    if (config.mock) {
      updateProfile({ [field(kind)]: await readAsDataUrl(blob) })
      return true
    }
    const sb = await getSupabase()
    const path = `${profile.userId}/${kind}-${crypto.randomUUID().slice(0, 12)}.${ext}`
    const { error } = await sb.storage.from('avatars').upload(path, blob, {
      contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) return fail('upload_failed')
    const old = kind === 'me' ? profile.avatarPath : profile.assistantAvatarPath
    updateProfile({ [field(kind)]: path })
    if (old && !/^(data|blob|https?):/.test(old))
      void sb.storage
        .from('avatars')
        .remove([old])
        .catch(() => {})
    return true
  } catch {
    return fail('unreadable')
  }
}

/** Back to the initial (or the default assistant icon). */
export async function removePicture(kind: PictureKind): Promise<void> {
  const profile = useSocial.getState().profile
  const old = kind === 'me' ? profile?.avatarPath : profile?.assistantAvatarPath
  updateProfile({ [field(kind)]: '' })
  if (old && !config.mock && !/^(data|blob|https?):/.test(old)) {
    const sb = await getSupabase().catch(() => null)
    void sb?.storage
      .from('avatars')
      .remove([old])
      .catch(() => {})
  }
}

function fail(code: string): false {
  social.setError('picture', code)
  return false
}
