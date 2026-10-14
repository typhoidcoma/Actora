import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({ config: { mock: false } }))
const upload = vi.fn((_path: string, _blob: Blob, _opts: unknown) => Promise.resolve({ error: null as unknown }))
const remove = vi.fn((_paths: string[]) => Promise.resolve({ error: null }))
vi.mock('../auth/supabase', () => ({
  supabaseBase: () => 'https://sb.test',
  getSupabase: () => Promise.resolve({ storage: { from: () => ({ upload, remove }) } }),
}))
const updateProfile = vi.fn()
vi.mock('./social', () => ({ updateProfile: (p: unknown) => updateProfile(p) }))

const { centreSquare, pictureUrl, removePicture, uploadPicture, PICTURE_PX } = await import('./pictures')
const { useSocial } = await import('../stores/social')

const drawn: unknown[][] = []
beforeEach(() => {
  drawn.length = 0
  upload.mockClear()
  remove.mockClear()
  updateProfile.mockClear()
  useSocial.setState({
    profile: { userId: 'u1', handle: 'me', displayName: null, avatarPath: 'u1/me-old.webp'} as never,
    errors: {},
  })
  // Just enough of the browser's image pipeline: a 400×300 picture onto a canvas, out as WebP.
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 400, height: 300, close() {} }))
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ imageSmoothingQuality: '', drawImage: (...a: unknown[]) => drawn.push(a) }),
      toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob(['x'], { type })),
    }),
  })
})
afterEach(() => vi.unstubAllGlobals())

const file = (type: string, size = 1000) => new File([new Uint8Array(size)], 'pic', { type })

describe('profile pictures', () => {
  it('are served from the public avatars bucket; inline data passes through', () => {
    expect(pictureUrl('u1/me-abc.webp')).toBe('https://sb.test/storage/v1/object/public/avatars/u1/me-abc.webp')
    expect(pictureUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(pictureUrl(null)).toBeNull()
    expect(pictureUrl('')).toBeNull()
  })

  it('crop to the largest centred square', () => {
    expect(centreSquare(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 })
    expect(centreSquare(300, 500)).toEqual({ sx: 0, sy: 100, size: 300 })
    expect(centreSquare(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 })
  })

  it('upload a small square into your own folder, save it on your profile, then drop the old one', async () => {
    expect(await uploadPicture(file('image/jpeg'), 'me')).toBe(true)
    // Drawn from the centred square of the 400×300 picture into a 256 px square.
    expect(drawn[0]).toEqual([expect.anything(), 50, 0, 300, 300, 0, 0, PICTURE_PX, PICTURE_PX])
    const [path, , opts] = upload.mock.calls[0]!
    expect(path).toMatch(/^u1\/me-[0-9a-f-]{12}\.webp$/)
    expect(opts).toMatchObject({ contentType: 'image/webp', upsert: false })
    expect(updateProfile).toHaveBeenCalledWith({ avatarPath: path })
    await Promise.resolve()
    expect(remove).toHaveBeenCalledWith(['u1/me-old.webp'])
  })

  it("an assistant's picture goes on assistantAvatarPath", async () => {
    await uploadPicture(file('image/png'), 'assistant')
    const [path] = upload.mock.calls[0]!
    expect(path).toMatch(/^u1\/assistant-/)
    expect(updateProfile).toHaveBeenCalledWith({ assistantAvatarPath: path })
  })

  it('refuses what is not a picture, or far too big, and says why', async () => {
    expect(await uploadPicture(file('application/pdf'), 'me')).toBe(false)
    expect(useSocial.getState().errors.picture).toBe('not_image')
    expect(await uploadPicture(file('image/png', 11 * 1024 * 1024), 'me')).toBe(false)
    expect(useSocial.getState().errors.picture).toBe('too_big')
    expect(upload).not.toHaveBeenCalled()
  })

  it('a failed upload changes nothing on your profile', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'nope' } })
    expect(await uploadPicture(file('image/png'), 'me')).toBe(false)
    expect(useSocial.getState().errors.picture).toBe('upload_failed')
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('removing clears the path and deletes the file', async () => {
    await removePicture('me')
    expect(updateProfile).toHaveBeenCalledWith({ avatarPath: '' })
    expect(remove).toHaveBeenCalledWith(['u1/me-old.webp'])
  })
})
