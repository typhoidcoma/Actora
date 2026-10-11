import { memo } from 'react'
import { secureUrl } from '../secureUrl'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// The agent's replies are Markdown with links, emphasis, lists, tables and
// third-party preview images (FRONTEND.md → "Rendering her replies").
// react-markdown never renders raw HTML, so no sanitiser is needed.
const components: Components = {
  // Only real links are links; anything else (a screen command she wrote as one) is just its words.
  a: ({ node: _node, href, children, ...props }) =>
    href && /^(https?:|mailto:|tel:)/i.test(href) ? (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ node: _node, alt, src, ...props }) => (
    <img
      {...props}
      src={typeof src === 'string' ? secureUrl(src) : src}
      alt={alt ?? ''}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  ),
}

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown
