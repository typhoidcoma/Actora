// In-browser stand-in for the Aelora server, used when VITE_AELORA_MOCK=1 or no
// backend is configured. It speaks the same frames as the real protocol,
// including the quirks: broadcast echoes, tool.progress, emotion, avatar.react.

import type { CalendarOccurrence, ClientMessage, Goal, Notification, ServerFrame, Task } from './protocol'
import type { WebSocketLike } from './socket'

const iso = (d: Date) => d.toISOString()
/** Local calendar date, YYYY-MM-DD (not UTC, or evenings roll into tomorrow). */
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000)
const uid = () => crypto.randomUUID()

function seed() {
  const now = iso(new Date())
  const g1 = uid()
  const g2 = uid()
  const g3 = uid()
  const goal = (id: string, title: string, timeframe: Goal['timeframe']): Goal => ({
    id,
    title,
    timeframe,
    description: null,
    status: 'active',
    vault_id: null,
    created_at: now,
    updated_at: now,
  })
  const task = (title: string, due: number | null, goal_id: string | null, status: Task['status'] = 'todo'): Task => ({
    id: uid(),
    title,
    status,
    goal_id,
    vault_id: null,
    due_date: due === null ? null : day(due),
    estimated_minutes: 25,
    committed_at: null,
    completed_at: status === 'done' ? now : null,
    created_at: now,
    updated_at: now,
  })
  const event = (title: string, startH: number, durH: number, location: string | null = null): CalendarOccurrence => ({
    id: uid(),
    title,
    start_time: iso(at(startH)),
    end_time: iso(at(startH + durH)),
    all_day: false,
    location,
    is_recurring: false,
  })
  const note = (title: string, body: string, minsAgo: number, read = false): Notification => {
    const t = iso(new Date(Date.now() - minsAgo * 60_000))
    return {
      id: uid(),
      origin_type: 'wendy',
      title,
      body,
      scheduled_for: t,
      sent_at: t,
      read_at: read ? t : null,
      created_at: t,
    }
  }
  return {
    goals: [
      goal(g1, 'Ship Actora v1', 'month'),
      goal(g2, 'Run a sub-25 5K', 'semester'),
      goal(g3, 'Read 2 books', 'month'),
    ],
    tasks: [
      task('Wire the orb shader', 0, g1),
      task('Review backend docs', 0, g1, 'done'),
      task('Tempo run 4 km', 0, g2),
      task('Morph tiles on tap', 1, g1),
      task('Chapter 6 — Dune', 1, g3),
      task('Book physio', 2, null),
      task('Interval session', 3, g2, 'done'),
    ],
    events: [
      event('Design sync', 0.6, 0.5, 'Studio'),
      event('Gym — legs', 3, 1),
      event('Dinner w/ Sam', 6, 2, 'Nopa'),
      event('Sprint planning', 24 + 1, 1, 'Zoom'),
      event('Dentist', 48 + 2, 0.75),
    ],
    notifications: [
      note('Tempo run today', 'You planned 4 km at threshold pace.', 12),
      note('Design sync in 40 min', 'Bring the tile morph prototype.', 3),
      note('Nice streak', 'Five days in a row on Actora.', 180, true),
    ],
  }
}

const REPLIES: Array<[RegExp, string, string?]> = [
  [
    /plan|today|day/i,
    "Here's your shape for today:\n\n- **Design sync** in under an hour\n- Two tasks for *Ship Actora v1*\n- Tempo run before dinner\n\nWant me to block focus time after the sync?",
    'list_tasks',
  ],
  [
    /calendar|event|schedule/i,
    "You've got **Design sync** next, then the gym at 3h out and dinner with Sam tonight.",
    'list_events',
  ],
  [/goal/i, '*Ship Actora v1* is moving — one of three tasks done. The 5K goal needs a run today.', 'list_goals'],
  [/add.*task|remind/i, 'Done — added it to your tasks for today.', 'create_task'],
  [
    /search|find|look up|best|shoe|run(ning)? (route|spot)|weekend/i,
    'Here are three good options I found:\n\n![Trail at golden hour](https://picsum.photos/seed/actora-trail/640/400)\n\n1. **[Discovery Park Loop](https://www.seattle.gov/parks)**: 2.8 mi of mostly soft trail, great at sunset.\n2. **[Green Lake](https://www.seattle.gov/parks)**: flat, 2.8 mi paved, busy on weekends.\n3. **[Burke-Gilman](https://www.seattle.gov/parks)**: long and steady if you want an easy tempo.\n\n| Route | Distance | Surface |\n|---|---|---|\n| Discovery Park | 2.8 mi | Trail |\n| Green Lake | 2.8 mi | Paved |\n\nWant me to put one on your calendar for tomorrow morning?',
    'web_search',
  ],
]

export class MockWebSocket implements WebSocketLike {
  readyState = 0
  onopen: WebSocketLike['onopen'] = null
  onmessage: WebSocketLike['onmessage'] = null
  onclose: WebSocketLike['onclose'] = null
  onerror: WebSocketLike['onerror'] = null

  private static db = seed()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private conversationId = uid()
  private transcript: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'assistant', content: "Morning. You've got a light day — want a quick plan?" },
  ]

  constructor() {
    this.later(350, () => {
      this.readyState = 1
      this.onopen?.(new Event('open'))
      this.emit({
        type: 'hello',
        userId: 'mock-user',
        email: 'you@example.com',
        isAdmin: false,
        model: 'mock',
        persona: 'wendy',
        botName: 'Wendy',
        uptime: 1,
        mood: { emotion: 'trust', intensity: 'mid', updatedAt: iso(new Date()) },
      })
      this.later(120, () => this.emit({ type: 'conversation.active', conversationId: this.conversationId }))
      this.scheduleInboxDrip()
    })
  }

  send(raw: string): void {
    const msg = JSON.parse(raw) as ClientMessage
    const db = MockWebSocket.db
    switch (msg.type) {
      case 'ping':
        return this.reply({ type: 'pong' })
      case 'task.list':
        return this.reply({ type: 'task.list', tasks: db.tasks })
      case 'goal.list':
        return this.reply({ type: 'goal.list', goals: db.goals })
      case 'notification.list':
        return this.reply({ type: 'notification.list', notifications: db.notifications })
      case 'calendar.list':
        return this.reply({ type: 'calendar.list', events: db.events })
      case 'conversation.open':
        return this.reply({
          type: 'conversation.messages',
          conversationId: this.conversationId,
          messages: this.transcript.map((m, i) => ({ seq: i + 1, ...m, createdAt: iso(new Date()) })),
          nextBeforeSeq: null,
          hasMore: false,
        })
      case 'task.complete': {
        const t = db.tasks.find((x) => x.id === msg.id)
        if (!t) return this.reply({ type: 'error', code: 'not_found', message: 'not found' })
        Object.assign(t, { status: 'done', completed_at: iso(new Date()), updated_at: iso(new Date()) })
        this.reply({ type: 'task.completed', task: { ...t } })
        // Broadcasts echo to the sender too — the client must dedupe by id.
        return this.reply({ type: 'event', event: 'task', data: { type: 'task:completed', task: { ...t } } })
      }
      case 'notification.read': {
        const n = db.notifications.find((x) => x.id === msg.id)
        if (!n) return
        n.read_at = iso(new Date())
        this.reply({ type: 'notification.marked', notification: { ...n } })
        return this.reply({
          type: 'event',
          event: 'notification',
          data: { type: 'notification:read', notification: { ...n } },
        })
      }
      case 'chat':
        return this.chat(
          String(msg.message ?? ''),
          typeof msg.conversationId === 'string' ? msg.conversationId : undefined,
        )
      case 'conversation.new':
        return this.reply({ type: 'conversation.created', conversationId: uid(), title: null })
      case 'conversation.rename':
        return this.reply({
          type: 'conversation.updated',
          conversationId: msg.conversationId,
          title: msg.title,
          tags: null,
        })
      case 'system_chat':
        return this.systemChat()
      case 'task.update': {
        const t = db.tasks.find((x) => x.id === msg.id)
        if (!t) return this.reply({ type: 'error', code: 'not_found', message: 'not found' })
        Object.assign(t, (msg.patch as Partial<Task>) ?? {}, { updated_at: iso(new Date()) })
        this.reply({ type: 'task.updated', task: { ...t } })
        return this.reply({ type: 'event', event: 'task', data: { type: 'task:updated', task: { ...t } } })
      }
      case 'task.create': {
        const now = iso(new Date())
        const task: Task = {
          id: uid(),
          title: String(msg.title ?? 'New task'),
          status: 'todo',
          goal_id: null,
          vault_id: null,
          due_date: typeof msg.dueDate === 'string' ? msg.dueDate : null,
          estimated_minutes: null,
          committed_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
        }
        MockWebSocket.db.tasks.push(task)
        this.reply({ type: 'task.created', task })
        return this.reply({ type: 'event', event: 'task', data: { type: 'task:created', task } })
      }
      case 'push.subscribe':
        return this.reply({ type: 'push.subscribed', endpoint: msg.endpoint })
      case 'push.unsubscribe':
        return this.reply({ type: 'push.unsubscribed', endpoint: msg.endpoint })
      case 'push.test':
        return this.reply({ type: 'push.tested', devices: 0, sent: 0, failed: 0, pruned: 0 })
    }
  }

  close(code = 1000): void {
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.({ code } as CloseEvent)
  }

  private toolCall(cid: string, name: string, args: Record<string, string>): void {
    this.emit({ type: 'tool.progress', conversationId: cid, channelId: cid, phase: 'called', name })
    this.event('mindmap', { type: 'tool:called', conversationId: cid, name, argsSummary: JSON.stringify(args) })
  }

  private chat(message: string, thread?: string): void {
    const cid = thread ?? this.conversationId
    const [, text, tool] = /today's fun stuff/i.test(message)
      ? [/./, FINDS_REPLY, 'web_search']
      : (REPLIES.find(([re]) => re.test(message)) ?? [
          /./,
          `Got it. I'm here whenever you want to go deeper on "${message.slice(0, 40)}".`,
          undefined,
        ])
    if (cid === this.conversationId) this.transcript.push({ role: 'user', content: message })
    let t = 250
    this.later(t, () => this.emit({ type: 'chat.start', conversationId: cid, channelId: cid }))
    this.later(t + 50, () =>
      this.event('emotion', { anticipation: 0.7, joy: 0.4, trust: 0.5, source: 'stream', conversationId: cid }),
    )

    if (tool) {
      // Real turns chain tools; show the activity line something to narrate.
      const chain: Array<[string, Record<string, string>]> =
        tool === 'web_search'
          ? [
              ['search_memory', { query: 'what they enjoy' }],
              ['web_search', { query: message.slice(0, 60) }],
              ['fetch_url', { url: 'https://www.theverge.com/tech' }],
            ]
          : [[tool, {}]]
      for (const [name, args] of chain.slice(0, -1)) {
        t += 300
        this.later(t, () => this.toolCall(cid, name, args))
        t += 1100
        this.later(t, () =>
          this.emit({ type: 'tool.progress', conversationId: cid, channelId: cid, phase: 'succeeded', name }),
        )
      }
      t += 300
      const [, lastArgs] = chain[chain.length - 1]
      const last = chain[chain.length - 1][0]
      this.later(t, () => this.toolCall(cid, last, lastArgs))
      t += 1100
      this.later(t, () => {
        this.emit({ type: 'tool.progress', conversationId: cid, channelId: cid, phase: 'succeeded', name: last })
        if (tool === 'create_task') {
          const title = message.replace(/^.*?(add( a)? task( to)?|remind me to)\s*/i, '').trim() || 'New task'
          const task: Task = {
            id: uid(),
            title: title[0].toUpperCase() + title.slice(1),
            status: 'todo',
            goal_id: null,
            vault_id: null,
            due_date: day(0),
            estimated_minutes: null,
            committed_at: null,
            completed_at: null,
            created_at: iso(new Date()),
            updated_at: iso(new Date()),
          }
          MockWebSocket.db.tasks.push(task)
          this.event('task', { type: 'task:created', task })
        }
        if (tool === 'list_events') this.event('agent_command', { command: { type: 'open_app', id: 'calendar' } })
        if (text === FINDS_REPLY)
          this.event('agent_command', {
            command: { type: 'ui_action', action: 'finds.set', args: { items: FIND_ITEMS } },
          })
      })
    }

    const words = text.split(/(?<=\s)/)
    t += 350
    words.forEach((w, i) => {
      this.later(t + i * 38, () => this.emit({ type: 'token', conversationId: cid, channelId: cid, delta: w }))
      if (i === Math.floor(words.length / 3)) {
        this.later(t + i * 38, () =>
          this.event('agent_command', {
            command: {
              type: 'avatar.react',
              trigger: 'good_news',
              bus: 'positive',
              state: 'happy',
              intensity: 0.7,
              holdMs: 1600,
              returnTo: 'idle',
            },
          }),
        )
      }
    })
    t += words.length * 38 + 120
    this.later(t, () => {
      if (cid === this.conversationId) this.transcript.push({ role: 'assistant', content: text })
      const mood = { emotion: 'joy', intensity: 'mid', updatedAt: iso(new Date()) }
      this.emit({ type: 'done', conversationId: cid, channelId: cid, text, mood })
      this.event('emotion', { joy: 0.6, trust: 0.6, anticipation: 0.3, source: 'llm', conversationId: cid })
    })
  }

  /** Welcome line over system_chat: frames carry only channelId, never conversationId. */
  private systemChat(): void {
    const channelId = 'system:mock-user'
    const db = MockWebSocket.db
    const open = db.tasks.filter((t) => t.status !== 'done')
    const next = [...db.events].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]
    const text = next
      ? `Hey you. ${next.title} is coming up soon — after that, "${open[0]?.title ?? 'a breather'}" is the one I'd protect today.`
      : 'Hey you. Quiet day so far — want to pick one thing to make it count?'
    this.later(200, () => this.emit({ type: 'chat.start', channelId }))
    const words = text.split(/(?<=\s)/)
    words.forEach((w, i) => this.later(320 + i * 45, () => this.emit({ type: 'token', channelId, delta: w })))
    this.later(400 + words.length * 45, () => this.emit({ type: 'done', channelId, text }))
  }

  private scheduleInboxDrip(): void {
    const drips = [
      ['Hydrate', 'Quick water break — it has been a while.'],
      ['Sprint planning tomorrow', 'Want me to draft an agenda?'],
      ['Run window', 'Weather is clear for the next 2 hours.'],
    ]
    let i = 0
    const tick = () => {
      if (i >= drips.length) return
      const [title, body] = drips[i++]
      const t = iso(new Date())
      const notification: Notification = {
        id: uid(),
        origin_type: 'wendy',
        title,
        body,
        scheduled_for: t,
        sent_at: t,
        read_at: null,
        created_at: t,
      }
      MockWebSocket.db.notifications.push(notification)
      this.event('notification', { type: 'notification:created', notification })
      this.later(45_000, tick)
    }
    this.later(14_000, tick)
  }

  private event(event: string, data: Record<string, unknown>): void {
    this.emit({ type: 'event', event, data })
  }

  private reply(frame: ServerFrame): void {
    this.later(60 + Math.random() * 120, () => this.emit(frame))
  }

  private emit(frame: ServerFrame): void {
    if (this.readyState !== 1) return
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent)
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }
}

/**
 * Stand-in for POST /api/llm option generation: context-aware canned options,
 * answering Wendy's last question when there is one.
 */
export async function mockLlm(req: { prompt: string }, signal?: AbortSignal): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 450)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })
  const p = req.prompt
  if (p.includes('RANK THESE CANDIDATES')) {
    const found = [...p.matchAll(/key: (\S+) \| (\w+) \| "([^"]*)"/g)].slice(0, 3)
    const whys: Record<string, string> = {
      event: 'Give yourself five minutes to land in it',
      task: 'Small, and it clears your head for the rest',
      notification: 'Quick one — I flagged it earlier',
      goal: 'One step today keeps the streak alive',
    }
    return JSON.stringify({ top: found.map(([, key, kind]) => ({ key, why: whys[kind] ?? 'Worth doing now' })) })
  }
  const last = /Wendy's last message[^\n]*\n([\s\S]*?)(?:\n\n|\nButtons|\nWrite)/.exec(p)?.[1] ?? ''
  const opt = (label: string, say = label) => ({ label, say })
  let options
  if (/\?\s*$/.test(last.trim())) {
    options = [
      opt('Yes, do it', 'Yes, please do that.'),
      opt('Not right now', 'Not right now, thanks.'),
      opt('Something lighter', 'Can we do something lighter instead?'),
    ]
  } else if (p.includes('Screen: the tasks panel')) {
    options = [
      opt('Quick wins', 'Which of these can I knock out in 10 minutes?'),
      opt('Batch errands', 'Can you batch my errands together?'),
    ]
  } else if (p.includes('Screen: the calendar panel')) {
    options = [
      opt('Protect my evening', 'Keep my evening free tonight.'),
      opt('Prep for next', 'Help me prep for my next event.'),
    ]
  } else if (p.includes('Screen: the user tapped')) {
    options = [
      opt('Do it with me', 'Walk me through this one step by step.'),
      opt('Is it urgent?', 'How urgent is this really?'),
    ]
  } else if (p.includes('reminder')) {
    options = [opt('On it', 'On it, thanks for the nudge.'), opt('Push to tonight', 'Remind me again tonight.')]
  } else if (/#1 \w+ "/.test(p)) {
    // Home: act on the cards by name, like the real prompt asks.
    const cards = [...p.matchAll(/#\d (\w+) "([^"]+)"/g)].slice(0, 2)
    const verb: Record<string, string> = {
      event: 'Ready for',
      task: 'Knock out',
      notification: 'Sort out',
      goal: 'Push on',
    }
    options = cards.map(([, kind, title]) =>
      opt(
        `${verb[kind] ?? 'Do'} ${title.split(' ').slice(0, 2).join(' ')}`.slice(0, 28),
        `Help me with "${title}" now.`,
      ),
    )
  } else {
    options = [
      opt('Ease me in', 'Ease me into the day with something small.'),
      opt('One big win', "What's the one big win for today?"),
    ]
  }
  return JSON.stringify({ options })
}

/** The fun finds Wendy puts on the card with finds.set (images via picsum for offline testing). */
const FIND_ITEMS = {
  finds: [
    {
      title: 'Octopuses caught "punching" fish on group hunts',
      blurb:
        'Researchers filmed octopuses swatting fish that slacked off during cooperative hunts. Workplace drama, but underwater.',
      why: 'Peak weird-nature energy for your coffee break',
      url: 'https://en.wikipedia.org/wiki/Octopus',
      image: 'https://picsum.photos/seed/actora-octo/800/500',
      source: 'Wikipedia',
      tag: 'Weird',
    },
    {
      title: 'A shader that paints with fluid physics in 40 lines',
      blurb: 'A tiny WebGL demo going viral for turning mouse drags into ink in water.',
      why: "You've been deep in orb shaders — this one's a gem",
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API',
      image: 'https://picsum.photos/seed/actora-shader/800/500',
      source: 'MDN',
      tag: 'Nerdy',
    },
    {
      title: 'Seattle’s waterfront park finally opens its sky bridge',
      blurb:
        'The new Overlook Walk links Pike Place to the water with sunset views and a surprising amount of seating.',
      why: 'A great new route for your evening runs',
      url: 'https://www.seattle.gov/parks',
      image: 'https://picsum.photos/seed/actora-park/800/500',
      source: 'Seattle Parks',
      tag: 'Local',
    },
    {
      title: 'Astronomers spot a “cotton candy” planet',
      blurb: 'A planet so puffy it has the density of spun sugar is orbiting a nearby star.',
      why: 'Small wonder to end the day on',
      url: 'https://science.nasa.gov/exoplanets/',
      image: 'https://picsum.photos/seed/actora-planet/800/500',
      source: 'NASA',
      tag: 'Good news',
    },
  ],
}.finds

/** Her Markdown reply in the finds thread (finds.set carries the cards). */
const FINDS_REPLY =
  'Four little gems today: octopuses with **workplace drama**, a shader you will want to fork, a new sunset route by the water, and a planet made of cotton candy. They are on your *For you* card.'
