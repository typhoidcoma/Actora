import type { CalendarOccurrence, Goal, Notification, Task } from '../aelora/protocol'
import { delivered } from '../aelora/protocol'
import type { AgentState } from '../stores/agent'
import type { EntitiesState } from '../stores/entities'
import type { Find } from '../finds/finds'
import type { PriorityItem } from '../priority/score'
import type { PushState } from '../stores/push'
import { actOption, sayOption, type Option } from './types'
import { shortLabel } from './label'

// Instant, deterministic options for every context. They render immediately
// and are then refined (not replaced wholesale) by Wendy-written options.

export interface Snapshot {
  entities: Pick<EntitiesState, 'tasks' | 'goals' | 'events' | 'notifications'>
  agent: Pick<AgentState, 'messages' | 'line' | 'notice' | 'turnId' | 'awaitingTurn'> &
    Partial<Pick<AgentState, 'mood' | 'greeting'>>
  push: Pick<PushState, 'status' | 'snoozedUntil'>
  now: number
  /** The three priority cards on screen, in order; home options act on them by name. */
  cards?: Array<Pick<PriorityItem, 'kind' | 'id' | 'title' | 'urgency'>>
  /** Today's fun finds, for Discover options. */
  finds?: Array<Pick<Find, 'id' | 'title' | 'url'>>
}

type Card = NonNullable<Snapshot['cards']>[number]

/**
 * Ways to move one card forward, best first, phrased for what kind of thing it
 * is. Later ones stand in when the first went stale (tapped, or ignored again
 * and again). Direct actions (Done, Got it) always work, so they're among them.
 */
function cardOptions(c: Card): Option[] {
  const t = short(c.title, 20)
  switch (c.kind) {
    case 'event':
      return c.urgency >= 0.75
        ? [
            sayOption(`Prep: ${t}`, `Help me prep for "${c.title}".`),
            sayOption(`Remind me before ${short(c.title, 12)}`, `Remind me 10 minutes before "${c.title}".`),
          ]
        : [
            sayOption(`Before ${t}?`, `What should I get done before "${c.title}"?`),
            sayOption(`Prep: ${t}`, `Help me prep for "${c.title}".`),
          ]
    case 'task':
      return [
        sayOption(`Start: ${t}`, `Help me get started on "${c.title}".`),
        actOption(`Done: ${short(c.title, 18)}`, { type: 'complete', id: c.id }),
        sayOption(`Break down ${short(c.title, 14)}`, `Break "${c.title}" into small steps.`),
      ]
    case 'notification':
      return [
        actOption(`Got it: ${short(c.title, 16)}`, { type: 'markRead', id: c.id }),
        sayOption(`Later: ${t}`, `Remind me about "${c.title}" again in an hour.`),
      ]
    case 'goal':
      return [
        sayOption(`Next step: ${t}`, `What's my next step for "${c.title}"?`),
        sayOption(`Task for ${short(c.title, 16)}`, `Add a task today for my goal "${c.title}".`),
      ]
  }
}

const MAX = 4

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const tomorrow = (now: number) => localDate(new Date(now + 86_400_000))

/** A title cut to whole words for a pill (never an ellipsis: the pill shortener does the rest). */
const short = (s: string, n = 22) => shortLabel(s, n)

const isOpen = (t: Task) => t.status !== 'done' && t.status !== 'skipped'

function openTasks(s: Snapshot): Task[] {
  return Object.values(s.entities.tasks)
    .filter(isOpen)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
}

function unread(s: Snapshot): Notification[] {
  return Object.values(s.entities.notifications).filter((n) => !n.read_at && delivered(n))
}

function nextEvent(s: Snapshot): CalendarOccurrence | null {
  return (
    Object.values(s.entities.events)
      .filter((e) => Date.parse(e.start_time) > s.now)
      .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0] ?? null
  )
}

/** Has Wendy replied at least once (so a reminder offer feels earned, not pushy)? */
const hasTalked = (s: Snapshot) => s.agent.messages.some((m) => m.role === 'assistant')

function pushOffer(s: Snapshot): Option[] {
  const { status, snoozedUntil } = s.push
  if (!hasTalked(s) || (snoozedUntil && snoozedUntil > s.now)) return []
  // One quiet chip, always last. Ignoring it is the "not now"; Wendy can push a
  // Not-now chip with push.offer when she raises it herself.
  if (status === 'off') return [actOption('Let Wendy remind me', { type: 'enablePush' })]
  if (status === 'needs-install') return [actOption('Get reminders here', { type: 'installHelp' })]
  return []
}

/** Stand-ins until Wendy's own options arrive: answer her if she asked, else go deeper. */
function followUps(s: Snapshot): Option[] {
  const last = [...s.agent.messages].reverse().find((m) => m.role === 'assistant')
  if (last && last.text.trim().endsWith('?')) {
    return [sayOption('Yes please', 'Yes please.'), sayOption('Not right now', 'Not right now, thanks.')]
  }
  return [sayOption('Tell me more'), sayOption('What else?')]
}

function home(s: Snapshot): Option[] {
  const { line, notice } = s.agent
  if (line === 'notice' && notice) {
    return [
      actOption('Got it', { type: 'markRead', id: notice.notificationId }),
      sayOption('Remind me in an hour', `Remind me about "${notice.title}" again in an hour.`),
      sayOption('Tell me more', `Tell me more about "${notice.title}".`),
    ]
  }
  if (line === 'reply' && s.agent.messages.at(-1)?.role === 'assistant') return followUps(s)

  if (s.cards?.length) {
    // Act on what is on screen. Only the top card is pinned; the rest compete with
    // Wendy's ideas, and each card's alternates fill in when its first idea is stale.
    const [first, ...others] = s.cards.slice(0, 3).map(cardOptions)
    return [
      { ...first[0], pin: true },
      ...others.map((o) => o[0]),
      sayOption('Plan my day'),
      ...[...first.slice(1), ...others.flatMap((o) => o.slice(1))].map((o) => ({ ...o, alt: true })),
      ...pushOffer(s),
    ]
  }

  const out: Option[] = [sayOption('Plan my day')]
  const ev = nextEvent(s)
  if (ev && Date.parse(ev.start_time) - s.now < 2 * 3_600_000) {
    out.push(sayOption("What's next?", `What do I need for "${ev.title}"?`))
  }
  if (unread(s).length > 0) out.push(sayOption('Catch me up', 'Catch me up on my notifications.'))
  const top = openTasks(s)[0]
  if (top) out.push(sayOption(`Start: ${short(top.title, 18)}`, `Help me get started on "${top.title}".`))
  // The reminders offer rides along at the end (mergeOptions keeps it last).
  return [...out.slice(0, MAX), ...pushOffer(s)]
}

function tile(id: string, s: Snapshot): Option[] {
  switch (id) {
    case 'tasks': {
      const today = localDate(new Date(s.now))
      const overdue = openTasks(s).filter((t) => t.due_date !== null && t.due_date < today)
      return [
        sayOption('Which first?', 'Which of my tasks should I do first?'),
        ...(overdue.length ? [sayOption('Move overdue to tomorrow', 'Move my overdue tasks to tomorrow.')] : []),
        sayOption('Add one for today', 'Help me add a task for today.'),
      ]
    }
    case 'goals':
      return [
        sayOption('How am I doing?', 'How am I doing on my goals?'),
        sayOption('What moves the needle?', 'What one thing today moves my goals forward most?'),
        sayOption('New goal', 'Help me set a new goal.'),
      ]
    case 'calendar':
      return [
        sayOption("What's next?", "What's next on my calendar?"),
        sayOption('Find focus time', 'Find me a block of focus time today.'),
        sayOption('Tomorrow?', 'What does tomorrow look like?'),
      ]
    case 'inbox': {
      const u = unread(s)
      return [
        ...(u.length ? [actOption('Mark all read', { type: 'markAllRead' } as const)] : []),
        sayOption('Summarize these', 'Summarize my notifications.'),
        sayOption('Anything urgent?', 'Is anything in my inbox urgent?'),
      ]
    }
  }
  return []
}

function item(kind: string, id: string, s: Snapshot): Option[] {
  const e = s.entities
  switch (kind) {
    case 'task': {
      const t: Task | undefined = e.tasks[id]
      if (!t) return []
      if (!isOpen(t))
        return [
          actOption('Reopen', { type: 'reopen', id }),
          sayOption('Nice. What next?', `I finished "${t.title}". What should I do next?`),
        ]
      const today = localDate(new Date(s.now))
      return [
        actOption('Done', { type: 'complete', id }),
        ...(t.status !== 'in_progress' ? [actOption('Start', { type: 'startTask', id })] : []),
        t.due_date && t.due_date < today
          ? actOption('Today', { type: 'reschedule', id, due: today })
          : actOption('Tomorrow', { type: 'reschedule', id, due: tomorrow(s.now) }),
        actOption('Pick a day…', { type: 'pickDay', id }),
        sayOption('Break it down', `Break "${t.title}" into small steps.`),
        sayOption('Why this?', `Why is "${t.title}" on my list?`),
        actOption('Delete…', { type: 'askDelete', item: { kind: 'task', id } }),
      ]
    }
    case 'goal': {
      const g: Goal | undefined = e.goals[id]
      if (!g) return []
      return [
        ...(g.status === 'active'
          ? [actOption('Achieved ✓', { type: 'goalStatus', id, status: 'completed' as const })]
          : [actOption('Back on', { type: 'goalStatus', id, status: 'active' as const })]),
        ...(g.status === 'active' ? [actOption('Pause', { type: 'goalStatus', id, status: 'paused' as const })] : []),
        sayOption('Next step', `What's my next step for "${g.title}"?`),
        sayOption('Add a task for it', `Add a task for my goal "${g.title}".`),
        sayOption("How's it going?", `How am I doing on "${g.title}"?`),
        actOption('Delete…', { type: 'askDelete', item: { kind: 'goal', id } }),
      ]
    }
    case 'event': {
      const ev = Object.values(e.events).find((x) => x.id === id)
      if (!ev) return []
      return [
        sayOption('Prep me', `Help me prep for "${ev.title}".`),
        sayOption('Move it', `Help me move "${ev.title}".`),
        sayOption('Details', `Tell me about "${ev.title}".`),
        actOption('Delete…', { type: 'askDelete', item: { kind: 'event', id } }),
      ]
    }
    case 'notification': {
      const n: Notification | undefined = e.notifications[id]
      if (!n) return []
      return [
        ...(n.read_at ? [] : [actOption('Got it', { type: 'markRead', id })]),
        // Snoozes are direct (no Wendy turn): back as a new reminder at that time.
        actOption('In an hour', { type: 'snooze', id, when: 'hour' }),
        actOption('Tonight', { type: 'snooze', id, when: 'tonight' }),
        actOption('Tomorrow 9am', { type: 'snooze', id, when: 'tomorrow' }),
        sayOption('Tell me more', `Tell me more about "${n.title}".`),
      ]
    }
  }
  return []
}

function chat(s: Snapshot): Option[] {
  const last = s.agent.messages.at(-1)
  if (!last) return [sayOption('Hey Wendy'), sayOption('Plan my day')]
  if (last.role === 'assistant') return followUps(s)
  return [sayOption('Plan my day'), sayOption("What's next?", "What's next on my calendar?")]
}

/** Discover: the fun finds panel, and one find inside it. */
function finds(key: string, s: Snapshot): Option[] {
  if (key === 'finds') {
    return [
      actOption('Find me more', { type: 'huntFinds' }),
      sayOption('Surprise me', "Surprise me with something fun I wouldn't expect to like."),
    ]
  }
  const f = s.finds?.find((x) => x.id === key.slice('find:'.length))
  if (!f) return []
  return [
    sayOption('Tell me more', `Tell me more about "${f.title}" (${f.url}).`),
    sayOption('More like this', `Find me more fun things like "${f.title}".`),
    actOption('Save for later', { type: 'saveFind', id: f.id }),
  ]
}

export function localOptions(key: string, s: Snapshot): Option[] {
  // Her last turn failed: one tap sends the same thing again, wherever the user is.
  const last = s.agent.messages.at(-1)
  const retry = last?.role === 'error' && !s.agent.turnId && !s.agent.awaitingTurn
  const base = forContext(key, s)
  return retry ? [{ ...actOption('Try again', { type: 'retry' }), pin: true }, ...base] : base
}

function forContext(key: string, s: Snapshot): Option[] {
  if (key === 'home') return home(s)
  if (key === 'vault')
    return [
      sayOption('What do you know?', 'What do you know about me so far?'),
      sayOption('Remember something', 'I want you to remember something about me.'),
      sayOption('Anything outdated?', 'Is anything you remember about me out of date?'),
    ]
  if (key === 'chat') return chat(s)
  if (key === 'finds' || key.startsWith('find:')) return finds(key, s)
  if (key.startsWith('tile:')) return tile(key.slice(5), s)
  if (key.startsWith('item:')) {
    const [, kind, ...rest] = key.split(':')
    return item(kind, rest.join(':'), s)
  }
  return []
}
