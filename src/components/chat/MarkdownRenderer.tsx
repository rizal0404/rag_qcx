'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Citation } from '@/types/chat'
import { findMatchingCitationIndex } from '@/lib/chat/citations'

interface MarkdownRendererProps {
  content: string
  citations?: Citation[]
  onCitationClick?: (citationIndex: number) => void
}

const INLINE_CITATION_PATTERN = /\[Page\s+(.+?),\s*Section\s+([^\]]+)\]/gi

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeSectionPath(sectionPath: string): string {
  return normalizeWhitespace(sectionPath).toLowerCase()
}

function parseCitationPages(value: string): number[] {
  return Array.from(value.matchAll(/\d+/g), (match) => Number.parseInt(match[0], 10)).filter((page) =>
    Number.isFinite(page),
  )
}

function findCitationIndex(
  label: string,
  sectionPath: string,
  citations: Citation[],
): number | null {
  const pageNumbers = parseCitationPages(label)
  return findMatchingCitationIndex(citations, normalizeSectionPath(sectionPath), pageNumbers)
}

function replaceInlineCitations(
  text: string,
  citations: Citation[],
  onCitationClick?: (citationIndex: number) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(INLINE_CITATION_PATTERN)) {
    const fullMatch = match[0]
    const matchIndex = match.index ?? -1

    if (matchIndex < 0) {
      continue
    }

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex))
    }

    const citationIndex = findCitationIndex(match[1] || '', match[2] || 'General', citations)

    if (citationIndex === null || !onCitationClick) {
      nodes.push(fullMatch)
    } else {
      nodes.push(
        <button
          key={`${fullMatch}-${matchIndex}`}
          type="button"
          className="mx-0.5 inline-flex items-center rounded-full border border-cyan-400/50 bg-cyan-400/10 px-2 py-0.5 align-baseline text-[0.75em] font-semibold text-cyan-300 transition hover:border-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-200"
          onClick={() => onCitationClick(citationIndex)}
          title="Open cited source preview"
        >
          {fullMatch}
        </button>,
      )
    }

    lastIndex = matchIndex + fullMatch.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

function injectCitationButtons(
  children: React.ReactNode,
  citations: Citation[],
  onCitationClick?: (citationIndex: number) => void,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return replaceInlineCitations(child, citations, onCitationClick)
    }

    if (!React.isValidElement(child)) {
      return child
    }

    if (typeof child.type === 'string' && ['code', 'pre', 'button', 'a'].includes(child.type)) {
      return child
    }

    const elementProps = child.props as { children?: React.ReactNode }

    if (!elementProps.children) {
      return child
    }

    return React.cloneElement(
      child as React.ReactElement<{ children?: React.ReactNode }>,
      {
        children: injectCitationButtons(elementProps.children, citations, onCitationClick),
      },
    )
  })
}

export default function MarkdownRenderer({
  content,
  citations = [],
  onCitationClick,
}: MarkdownRendererProps) {
  const renderWithInteractiveCitations = (children: React.ReactNode) =>
    injectCitationButtons(children, citations, onCitationClick)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        p: ({children, ...props}) => <p {...props}>{renderWithInteractiveCitations(children)}</p>,
        li: ({children, ...props}) => <li {...props}>{renderWithInteractiveCitations(children)}</li>,
        table: ({...props}) => (
          <div className="overflow-x-auto my-4 w-full border rounded-lg bg-white">
            <table className="min-w-full text-sm divide-y divide-slate-200" {...props} />
          </div>
        ),
        thead: ({...props}) => <thead className="bg-slate-50 w-full" {...props} />,
        th: ({children, ...props}) => (
          <th className="px-4 py-2 text-left font-semibold text-slate-700 border-b" {...props}>
            {renderWithInteractiveCitations(children)}
          </th>
        ),
        td: ({children, ...props}) => (
          <td className="px-4 py-2 border-b border-slate-100 text-slate-600" {...props}>
            {renderWithInteractiveCitations(children)}
          </td>
        ),
        a: ({...props}) => <a className="text-blue-600 hover:underline" {...props} />,
        pre: ({className, children, ...props}) => (
          <pre
            className={`my-2 overflow-x-auto rounded-md bg-slate-800 p-4 text-xs text-slate-100 ${
              className ?? ''
            }`.trim()}
            {...props}
          >
            {children}
          </pre>
        ),
        code: ({className, children, ...props}) => (
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
