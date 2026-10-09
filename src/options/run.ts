import { ask, chat, completeTask, markNotificationRead, rescheduleTask } from '../aelora/client'
import { hunt, useFinds } from '../finds/finds'
import { enablePush, INSTALL_HELP } from '../push/push'
import { agent, orbSignals, useAgent } from '../stores/agent'
import { useEntities } from '../stores/entities'
import { optionsStore } from '../stores/options'
import { snoozePushOffer } from '../stores/push'
import { ui, useUi } from '../stores/ui'
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
      if (why) agent.showMessage(why)
      // No voice possible here: the keyboard is the way to talk instead.
      if (error === 'unsupported' || error === 'not-allowed' || error === 'service-not-allowed' || error === 'insecure')
        ui.keyboard(true)
    },
  })
}

/** Send a user turn. Off the chat screen, Wendy answers in the line above the grid. */
export function say(text: string): boolean {
  const u = useUi.getState()
  if (!u.chatOpen) agent.showReply()
  const sent = chat(text)
  // A big question gets the full reader straight away, so the whole answer can
  // be read (and replied to from the rail) as it streams in.
  if (sent && !u.chatOpen && !u.reader && isLargeQuestion(text)) ui.openReader()
  return sent
}

async function markAllRead(): Promise<void> {
  const unread = Object.values(useEntities.getState().notifications).filter((n) => !n.read_at)
  for (const n of unread) await markNotificationRead(n.id)
}

/** "Save for later": a fun find becomes a task to come back to. */
async function saveFind(id: string): Promise<void> {
  const f = useFinds.getState().items.find((x) => x.id === id)
  if (!f) return
  const r = await ask({ type: 'task.create', title: `Read: ${f.title}`.slice(0, 120) }, 'task.created')
  agent.showMessage(r ? `Saved "${f.title}" to your tasks.` : "Couldn't save that one. Try again in a moment.")
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
  }
}

export function runOption(o: Option): void {
  optionsStore.noteTapped(o)
  if (o.act) runAct(o.act)
  else if (o.say) say(o.say)
}
