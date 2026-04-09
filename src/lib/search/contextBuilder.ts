import { SearchResult } from './hybrid'

export function buildContextFromResults(results: SearchResult[]): string {
  if (!results || results.length === 0) {
    return ''
  }

  // Format each chunk as a citation-ready block
  const chunkBlocks = results.map((result, index) => {
    // Determine the citation path
    const section = result.section_path || 'General'
    const pages = result.page_numbers?.join(',') || 'N/A'
    const docTitle = result.metadata?.documentTitle || 'Unknown Document'
    const docNum = result.metadata?.documentNumber ? ` (${result.metadata.documentNumber})` : ''
    
    return `[START OF SOURCE ${index + 1}]
Source ID: ${result.chunk_id}
Document: ${docTitle}${docNum}
Location: [Page ${pages}, Section ${section}]

${result.parent_content ? `Parent Context:\n${result.parent_content}\n\n` : ''}Retrieved Chunk:
${result.content}
[END OF SOURCE ${index + 1}]`
  })

  return chunkBlocks.join('\n\n')
}
