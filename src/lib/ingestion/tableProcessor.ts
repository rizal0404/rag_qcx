import type { ContentType } from '@/types/database'
import type { IngestedChunk, RawIngestionElement } from '@/types/ingestion'

function splitRow(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
}

function normalizeDelimitedTable(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return content.trim()
  }

  if (content.includes('|')) {
    return lines.join('\n')
  }

  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
  const columnCount = Math.max(...rows.map((row) => row.length))

  if (columnCount < 2) {
    return content.trim()
  }

  const normalizedRows = rows.map((row) => {
    const padded = [...row]
    while (padded.length < columnCount) {
      padded.push('')
    }

    return `| ${padded.join(' | ')} |`
  })

  const separator = `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`
  return [normalizedRows[0], separator, ...normalizedRows.slice(1)].join('\n')
}

function summarizeTable(markdownTable: string, contentType: ContentType): string {
  const rows = markdownTable
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))

  if (rows.length < 2) {
    return `${contentType} extracted from the source document.`
  }

  const headers = splitRow(rows[0])
  const dataRows = rows.slice(2, 5).map(splitRow)
  const rowSummaries = dataRows
    .map((row) =>
      headers
        .map((header, index) => {
          const value = row[index]
          return value ? `${header}: ${value}` : null
        })
        .filter(Boolean)
        .join(', ')
    )
    .filter(Boolean)

  if (rowSummaries.length === 0) {
    return `${contentType} with columns ${headers.join(', ')}.`
  }

  return `${contentType} with columns ${headers.join(', ')}. Key entries: ${rowSummaries.join(' | ')}.`
}

export function processTableElement(
  element: RawIngestionElement,
  contentType: ContentType,
): IngestedChunk {
  const tableMarkdown = normalizeDelimitedTable(element.content)

  return {
    content: tableMarkdown,
    content_type: contentType,
    section_path: element.section_path ?? null,
    page_numbers: element.page_numbers ?? [],
    parent_chunk_id: element.parent_chunk_id ?? null,
    metadata: {
      ...(element.metadata ?? {}),
      table_markdown: tableMarkdown,
      llm_summary: summarizeTable(tableMarkdown, contentType),
    },
    image_data: element.image_data,
  }
}
