import { describe, expect, it } from 'vitest'
import { describeTool, thinkingWords, toolDetail } from './activity'

describe('describeTool', () => {
  it('names common tools in plain words', () => {
    expect(describeTool('web_search').doing).toBe('Searching the web')
    expect(describeTool('search_memory').done).toBe('Checked what I remember')
    expect(describeTool('search_conversations').icon).toBe('memory')
    expect(describeTool('fetch_url').doing).toBe('Reading a page')
    expect(describeTool('create_task').doing).toBe('Updating your tasks')
    expect(describeTool('list_events').doing).toBe('Checking your calendar')
    expect(describeTool('save_fact').doing).toBe('Making a note')
  })

  it('falls back to a humanised name', () => {
    expect(describeTool('frobnicate_widget')).toEqual({
      doing: 'Frobnicate widget',
      done: 'Frobnicate widget',
      icon: 'tool',
    })
  })
})

describe('toolDetail', () => {
  it('pulls the query, or the host of a url', () => {
    expect(toolDetail('{"query":"best ramen in Seattle"}')).toBe('best ramen in Seattle')
    expect(toolDetail('{"url":"https://www.theverge.com/tech/1"}')).toBe('theverge.com')
  })

  it('reads truncated JSON', () => {
    expect(toolDetail('{"limit":5,"query":"octopus fish punching", "mo')).toBe('octopus fish punching')
  })

  it('returns null for nothing useful', () => {
    expect(toolDetail(undefined)).toBeNull()
    expect(toolDetail('{"limit":5}')).toBeNull()
  })
})

it('thinking words move on as time passes', () => {
  expect(thinkingWords(0)).toBe('Thinking')
  expect(thinkingWords(25_000)).toBe('Still on it')
})
