import { memo } from 'react'
import { secureUrl } from '../secureUrl'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Wendy's replies are Markdown with links, emphasis, lists, tables and
// third-party preview images (FRONTEND.md → "Rendering her replies").
// react-markdown never renders raw HTML, so no sanitiser is needed.
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
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
