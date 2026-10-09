import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { press } from './motion'

/** Clipboard API where allowed; a hidden textarea where it isn't (older browsers, plain http). */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** A small, quiet Copy button that confirms with "Copied". */
export function CopyButton({
  text,
  label = 'Copy',
  className = '',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1600)
    return () => clearTimeout(t)
  }, [state])

  return (
    <motion.button
      whileTap={press}
      onClick={async () => setState((await writeClipboard(text)) ? 'done' : 'failed')}
      aria-label={state === 'done' ? 'Copied' : label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[13px] font-medium text-muted transition-colors hover:bg-text/6 hover:text-strong ${className}`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        {state === 'done' ? (
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth={1.4} />
            <path
              d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
            />
          </>
        )}
      </svg>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.15 }}
        >
          {state === 'done' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
