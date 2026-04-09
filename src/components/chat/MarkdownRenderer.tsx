'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        table: ({node, ...props}) => (
          <div className="overflow-x-auto my-4 w-full border rounded-lg bg-white">
            <table className="min-w-full text-sm divide-y divide-slate-200" {...props} />
          </div>
        ),
        thead: ({node, ...props}) => <thead className="bg-slate-50 w-full" {...props} />,
        th: ({node, ...props}) => <th className="px-4 py-2 text-left font-semibold text-slate-700 border-b" {...props} />,
        td: ({node, ...props}) => <td className="px-4 py-2 border-b border-slate-100 text-slate-600" {...props} />,
        a: ({node, ...props}) => <a className="text-blue-600 hover:underline" {...props} />,
        pre: ({node, className, children, ...props}) => (
          <pre
            className={`my-2 overflow-x-auto rounded-md bg-slate-800 p-4 text-xs text-slate-100 ${
              className ?? ''
            }`.trim()}
            {...props}
          >
            {children}
          </pre>
        ),
        code: ({node, className, children, ...props}) => (
          <code className={`rounded px-1 py-0.5 text-xs ${className ?? 'bg-slate-100 text-pink-600'}`.trim()} {...props}>
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
