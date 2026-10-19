import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { clearFound, createInvite, findHandle, requestFriend } from '../../social/social'
import { nameOf, useSocial } from '../../stores/social'
import { CopyButton } from '../CopyButton'
import { press } from '../motion'
import { Avatar, Qr } from './bits'

/** Find someone by their exact handle, or share a link / QR they can open. */
export function AddFriend() {
  const { found, finding, friends, invite, errors } = useSocial()
  const [q, setQ] = useState('')
  const [qr, setQr] = useState(false)
  const [asked, setAsked] = useState<string | null>(null)
  useEffect(() => () => clearFound(), [])

  const row = found?.profile ? friends.find((f) => f.profile.userId === found.profile!.userId) : undefined
  const state = !found?.profile
    ? null
    : row?.status === 'accepted'
      ? 'Friends'
      : row?.direction === 'outgoing' || asked === found.profile.userId
        ? 'Requested'
        : row?.direction === 'incoming'
          ? 'Asked you'
          : null

  const share = async () => {
    if (!invite) return
    try {
      await navigator.share?.({ title: 'Be friends on Actora', url: invite.url })
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="grid max-w-[520px] grid-cols-[minmax(0,1fr)] gap-6">
      <section>
        <h3 className="label mb-2 text-muted">By handle</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            findHandle(q)
          }}
        >
          <label className="glass-pill flex h-11 min-w-0 flex-1 items-center rounded-[8px] px-3">
            <span className="text-faint">@</span>
            <input
              name="friend-handle"
              value={q}
              onChange={(e) => setQ(e.target.value.replace(/\s/g, '').replace(/^@/, ''))}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="their handle"
              aria-label="Their handle"
              className="h-full min-w-0 flex-1 bg-transparent pl-1 text-[16px] text-strong outline-none placeholder:text-faint"
            />
          </label>
          <motion.button
            whileTap={press}
            type="submit"
            disabled={!q.replace(/^@/, '').trim() || finding}
            className="h-11 shrink-0 rounded-[8px] bg-fill px-4 text-[15px] font-semibold text-on-accent transition-colors disabled:bg-text/10 disabled:text-faint"
          >
            {finding ? 'Looking…' : 'Find'}
          </motion.button>
        </form>
        {found && !found.profile && (
          <p className="mt-3 text-[15px] text-muted">No one by that handle. Handles have to match exactly.</p>
        )}
        {errors.find && <p className="mt-3 text-[15px] text-urgent">Couldn't look that up just now.</p>}
        {found?.profile && (
          <div className="mt-3 flex items-center gap-3">
            <Avatar who={found.profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold text-strong">{nameOf(found.profile)}</p>
              {found.profile.displayName?.trim() && (
                <p className="truncate text-[13px] text-muted">@{found.profile.handle}</p>
              )}
            </div>
            {state ? (
              <span className="text-[13px] text-muted">{state}</span>
            ) : (
              <motion.button
                whileTap={press}
                onClick={() => {
                  setAsked(found.profile!.userId)
                  requestFriend(found.profile!.userId)
                }}
                className="h-9 shrink-0 rounded-[8px] bg-fill px-3 text-[14px] font-semibold text-on-accent"
              >
                Add friend
              </motion.button>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="label mb-2 text-muted">Invite</h3>
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileTap={press}
            onClick={() => {
              setQr(false)
              createInvite(false)
            }}
            className="glass-pill h-10 rounded-[8px] px-4 text-[14px] font-medium text-strong"
          >
            Make a link
          </motion.button>
          <motion.button
            whileTap={press}
            onClick={() => {
              setQr(true)
              createInvite(true)
            }}
            className="glass-pill h-10 rounded-[8px] px-4 text-[14px] font-medium text-strong"
          >
            Show a QR code
          </motion.button>
        </div>
        {errors.invite && <p className="mt-3 text-[15px] text-urgent">Couldn't make an invite just now.</p>}
        {invite && !invite.autoAccept && !qr && (
          // minmax(0,1fr): the long link is cut off with "…" instead of widening the panel.
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
            <p className="text-[13px] text-muted">
              Anyone with this link can ask to be your friend. It works once, for a week.
            </p>
            <code className="glass-pill selectable block truncate rounded-[8px] px-3 py-2.5 font-sans text-[13px] text-strong">
              {invite.url}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={invite.url} label="Copy link" />
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <motion.button
                  whileTap={press}
                  onClick={() => void share()}
                  className="h-9 shrink-0 rounded-[8px] bg-fill px-3 text-[14px] font-semibold text-on-accent"
                >
                  Share
                </motion.button>
              )}
            </div>
          </div>
        )}
        {invite && invite.autoAccept && qr && (
          <div className="mt-3 grid justify-items-start gap-2">
            <Qr text={invite.url} />
            <p className="text-[13px] text-muted">
              Scanning this makes you friends straight away. It works once, for a day.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
