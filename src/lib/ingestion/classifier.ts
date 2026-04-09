import type { ContentType } from '@/types/database'
import type { RawIngestionElement } from '@/types/ingestion'

const CONTENT_TYPES: ContentType[] = [
  'NARRATIVE_TEXT',
  'SPEC_TABLE',
  'PROCEDURE_TABLE',
  'WIRING_DIAGRAM',
  'TECHNICAL_PHOTO',
  'SAFETY_CALLOUT',
  'PARTS_LIST',
]

const SAFETY_PATTERN = /\b(danger|warning|caution|note)\b/i
const SPEC_UNIT_PATTERN = /\b(mm|cm|kg|kw|vac|vdc|v ac|hz|ip\d{2}|bar|mbar|amp|a|w|°c)\b/i
const PROCEDURE_PATTERN = /\b(interval|task|step|procedure|maintenance|inspection|weekly|monthly|daily)\b/i
const PARTS_PATTERN = /\b(part number|spare part|quantity|qty|item no)\b/i
const WIRING_PATTERN = /\b(wiring|plc|terminal|profibus|beckhoff|24v|power supply|schematic)\b/i
const CALLOUT_PATTERN = /(^|\n)\s*(\d+[\.\)]|\-\s*\d+\s*:)/m

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && CONTENT_TYPES.includes(value as ContentType)
}

export function classifyContentType(element: RawIngestionElement): ContentType {
  if (isContentType(element.content_type)) {
    return element.content_type
  }

  const metadataType = element.metadata?.content_type
  if (isContentType(metadataType)) {
    return metadataType
  }

  if (element.image_data) {
    return element.image_data.image_type === 'wiring_diagram'
      ? 'WIRING_DIAGRAM'
      : 'TECHNICAL_PHOTO'
  }

  const content = element.content.trim()
  const lower = content.toLowerCase()
  const isTable = content.includes('|') || /\t/.test(content)

  if (SAFETY_PATTERN.test(lower)) {
    return 'SAFETY_CALLOUT'
  }

  if (isTable && PARTS_PATTERN.test(lower)) {
    return 'PARTS_LIST'
  }

  if (isTable && PROCEDURE_PATTERN.test(lower)) {
    return 'PROCEDURE_TABLE'
  }

  if (isTable && SPEC_UNIT_PATTERN.test(lower)) {
    return 'SPEC_TABLE'
  }

  if (WIRING_PATTERN.test(lower)) {
    return 'WIRING_DIAGRAM'
  }

  if (CALLOUT_PATTERN.test(content)) {
    return 'TECHNICAL_PHOTO'
  }

  return 'NARRATIVE_TEXT'
}
