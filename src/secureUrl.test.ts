import { describe, expect, it } from 'vitest'
import { parseFinds } from './finds/finds'
import { secureUrl } from './secureUrl'

describe('secureUrl', () => {
  it('asks for http resources over https and leaves everything else alone', () => {
    expect(secureUrl('http://static1.squarespace.com/a.png?format=1500w')).toBe(
      'https://static1.squarespace.com/a.png?format=1500w',
    )
    expect(secureUrl('https://x.dev/a.png')).toBe('https://x.dev/a.png')
    expect(secureUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(secureUrl('/icons/icon-192.png')).toBe('/icons/icon-192.png')
    expect(secureUrl(null)).toBeNull()
  })

  it('finds come out with https images and links', () => {
    const [f] = parseFinds(
      JSON.stringify({
        items: [{ title: 'Tide', url: 'http://localtide.com/x', image: 'http://static1.squarespace.com/t.png' }],
      }),
    )
    expect(f).toMatchObject({ url: 'https://localtide.com/x', image: 'https://static1.squarespace.com/t.png' })
  })
})
