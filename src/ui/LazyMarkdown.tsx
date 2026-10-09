import { lazy, Suspense } from 'react'

// The Markdown stack is the heaviest dependency; it loads on first use (or when
// warmed by preloadMarkdown) and renders plain text until then.
const Markdown = lazy(() => import('./Markdown'))

export function LazyMarkdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="md whitespace-pre-wrap">{text}</div>}>
      <Markdown text={text} />
    </Suspense>
  )
}
