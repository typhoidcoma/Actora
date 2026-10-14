import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { removePicture, uploadPicture, type PictureKind } from '../../social/pictures'
import { useSocial } from '../../stores/social'
import { press } from '../motion'
import { AssistantAvatar, Avatar } from './bits'

const SAY: Record<string, string> = {
  not_image: "That isn't a picture.",
  too_big: 'That picture is too big (10 MB at most).',
  upload_failed: "Couldn't upload it. Try again.",
  unreadable: "Couldn't read that picture.",
  no_profile: 'Pick a handle first.',
}

/**
 * Your picture, or your assistant's: the tile as friends see it, with Change and
 * Remove. Any picture is cropped to a centred square and made small first.
 */
export function PictureEditor({ kind }: { kind: PictureKind }) {
  const profile = useSocial((s) => s.profile)
  const error = useSocial((s) => s.errors.picture ?? null)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  if (!profile) return null
  const path = kind === 'me' ? profile.avatarPath : profile.assistantAvatarPath

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    await uploadPicture(file, kind)
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  return (
    <div className="flex items-center gap-4">
      {kind === 'me' ? <Avatar who={profile} size={56} /> : <AssistantAvatar path={path} size={56} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileTap={press}
            onClick={() => input.current?.click()}
            disabled={busy}
            className="glass-pill h-9 rounded-[8px] px-3 text-[13px] font-semibold text-strong disabled:opacity-60"
          >
            {busy ? 'Saving…' : path ? 'Change picture' : 'Add a picture'}
          </motion.button>
          {path && !busy && (
            <button
              onClick={() => void removePicture(kind)}
              className="glass-pill h-9 rounded-[8px] px-3 text-[13px] font-semibold text-muted"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-[12px] text-muted" aria-live="polite">
          {error ? (
            <span className="text-urgent">{SAY[error] ?? "That didn't work. Try again."}</span>
          ) : kind === 'me' ? (
            'Friends see it beside your name and messages.'
          ) : (
            'Friends see it on your assistant’s replies. Without one, it shows the assistant icon.'
          )}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label={kind === 'me' ? 'Choose your picture' : "Choose your assistant's picture"}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  )
}
