import {
  ask,
  chat,
  completeTask,
  markNotificationRead,
  reopenTask,
  rescheduleTask,
  setGoalStatus,
  snoozeNotification,
  startTask,
  moveOverdueToToday,
  startFocus,
} from '../aelora/client'
import { delivered } from '../aelora/protocol'
import { hunt, useFinds } from '../finds/finds'
import { enablePush, INSTALL_HELP } from '../push/push'
import { agent, orbSignals, useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { optionsStore } from '../stores/options'
import { snoozePushOffer } from '../stores/push'
import { toast } from '../stores/toast'
import { panelOpen, ui, useUi } from '../stores/ui'
import { isLargeQuestion } from '../ui/markdownText'
import { listen, speechProblem } from '../voice/speech'
import type { LocalAct, Option } from './types'

let stopVoice: (() => void) | null = null

/** Start (or stop) listening; the final transcript is sent to Wendy as a turn. */
export function toggleVoice(): void {
  if (stopVoice) {
    stopVoice()
    return
  }
  optionsStore.voice(true, '')
  stopVoice = listen({
    onInterim: (t) => {
      optionsStore.voice(true, t)
      orbSignals.bump(0.3) // the orb pulses as words come in
    },
    onFinal: (t) => say(t),
    onEnd: (error) => {
      stopVoice = null
      optionsStore.voice(false, '')
      // Say why nothing happened (blocked mic, no mic, offline, no voice in this browser…).
      const why = speechProblem(error)
      if (why) toast.error(why, { ms: 7000 })
      // No voice possible here: the keyboard is the way to talk instead.
      if (error === 'unsupported' || error === 'not-allowed' || error === 'service-not-allowed' || error === 'insecure')
        ui.keyboard(true)
    },
  })
}

/** Send a user turn. Off the chat screen, Wendy answers in the line above the grid. */
export function say(text: string): boolean {
  const u = useUi.getState()
  // Asked from inside a task, list or other panel: answer in the main chat, so
  // the user sees her think and talk instead of a panel with no words in it.
  if (!u.chatOpen && panelOpen(u)) {
    const sent = chat(text)
    if (sent) ui.openChat()
    return sent
  }
  if (!u.chatOpen) agent.showReply()
  const sent = chat(text)
  // A big question opens the chat straight away, so the whole answer can be
  // read (and replied to) as it streams in.
  if (sent && !u.chatOpen && isLargeQuestion(text)) ui.openChat()
  return sent
}

async function markAllRead(): Promise<void> {
  const unread = Object.values(useEntities.getState().notifications).filter((n) => !n.read_at && delivered(n))
  for (const n of unread) await markNotificationRead(n.id)
}

/** "Save for later": a fun find becomes a task to come back to. */
async function saveFind(id: string): Promise<void> {
  const f = useFinds.getState().items.find((x) => x.id === id)
  if (!f) return
  // The link and why it's interesting go in the task's notes, so the saved task leads back to the find.
  const notes = [f.blurb, f.url].filter(Boolean).join('\n\n')
  const r = await ask(
    { type: 'task.create', title: `Read: ${f.title}`.slice(0, 120), ...(notes ? { notes } : {}) },
    'task.created',
  )
  if (r) toast.show(`Saved "${f.title}" to your tasks`)
  else toast.error("Couldn't save that one. Try again in a moment.")
}

/** When a snoozed reminder comes back: in an hour, tonight at 7 (or in 2h if later), tomorrow at 9. */
export function snoozeTime(when: 'hour' | 'tonight' | 'tomorrow', now = new Date()): Date {
  if (when === 'hour') return new Date(now.getTime() + 60 * 60_000)
  if (when === 'tonight') {
    const seven = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19)
    return seven.getTime() - now.getTime() > 30 * 60_000 ? seven : new Date(now.getTime() + 2 * 60 * 60_000)
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9)
}

function runAct(act: LocalAct): void {
  switch (act.type) {
    case 'focus':
      return ui.focus(act.tile)
    case 'close':
      return ui.closeAll()
    case 'openChat':
      return ui.openChat()
    case 'select':
      return ui.open(act.item)
    case 'complete':
      void completeTask(act.id)
      ui.select(null)
      return
    case 'reschedule':
      void rescheduleTask(act.id, act.due)
      ui.select(null)
      return
    case 'markRead': {
      void markNotificationRead(act.id)
      const a = useAgent.getState()
      if (a.line === 'notice' && a.notice?.notificationId === act.id) agent.showGreeting()
      ui.select(null)
      return
    }
    case 'markAllRead':
      void markAllRead()
      return
    case 'voice':
      return toggleVoice()
    case 'keyboard':
      return ui.keyboard(true)
    case 'enablePush':
      void enablePush()
      return
    case 'snoozePush':
      snoozePushOffer()
      return
    case 'installHelp':
      return agent.showMessage(INSTALL_HELP)
    case 'greeting':
      return agent.showGreeting()
    case 'huntFinds':
      return hunt()
    case 'openFinds':
      return ui.openFinds()
    case 'saveFind':
      void saveFind(act.id)
      return
    case 'askDelete':
      return ui.askDelete(act.item)
    case 'moveOverdue':
      return void moveOverdueToToday(act.today)
    case 'startFocus':
      return void startFocus(act.anchor)
    case 'reopen':
      return void reopenTask(act.id)
    case 'startTask':
      return void startTask(act.id)
    case 'pickDay':
      return ui.pickDay(act.id)
    case 'goalStatus':
      return void setGoalStatus(act.id, act.status)
    case 'snooze':
      ui.select(null)
      return void snoozeNotification(act.id, snoozeTime(act.when))
    case 'retry': {
      // Send the last thing the user said again.
      const lastSaid = useAgent.getState().messages.findLast((m) => m.role === 'user')
      if (lastSaid) say(lastSaid.text)
      return
    }
  }
}

export function runOption(o: Option): void {
  optionsStore.noteTapped(o)
  if (o.act) runAct(o.act)
  else if (o.say) say(o.say)
}
