import type { ReactNode } from 'react'

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <header className="mb-1 flex items-baseline justify-between">
        <h3 className="eyebrow">{title}</h3>
        {count !== undefined && <span className="num text-xs text-faint">{String(count).padStart(2, '0')}</span>}
      </header>
      <ul>{children}</ul>
    </section>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted">{text}</p>
}
