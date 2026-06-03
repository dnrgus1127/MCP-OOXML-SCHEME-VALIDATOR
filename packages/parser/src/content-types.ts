/**
 * Content Types Parser
 *
 * Parses [Content_Types].xml to determine the MIME type of each part.
 */

import { XMLParser } from 'fast-xml-parser'
import type { ContentTypeEntry } from './types'

const CONTENT_TYPES_PATH = '/[Content_Types].xml'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

export interface ContentTypesResult {
  defaults: Map<string, string>
  overrides: Map<string, string>
  entries: ContentTypeEntry[]
}

/**
 * Parse [Content_Types].xml content
 */
export function parseContentTypes(xml: string): ContentTypesResult {
  const parsed = parser.parse(xml)
  const types = parsed.Types || {}

  const defaults = new Map<string, string>()
  const overrides = new Map<string, string>()
  const entries: ContentTypeEntry[] = []

  // Process Default entries (by extension)
  const defaultEntries = ensureArray(types.Default || [])
  for (const entry of defaultEntries) {
    const extension = entry['@_Extension'] || ''
    const contentType = entry['@_ContentType'] || ''

    if (extension && contentType) {
      defaults.set(extension.toLowerCase(), contentType)
      entries.push({
        key: extension,
        contentType,
        isDefault: true,
      })
    }
  }

  // Process Override entries (by part name)
  const overrideEntries = ensureArray(types.Override || [])
  for (const entry of overrideEntries) {
    const partName = entry['@_PartName'] || ''
    const contentType = entry['@_ContentType'] || ''

    if (partName && contentType) {
      overrides.set(partName, contentType)
      entries.push({
        key: partName,
        contentType,
        isDefault: false,
      })
    }
  }

  return { defaults, overrides, entries }
}

/**
 * Get content type for a part path
 */
export function getContentType(result: ContentTypesResult, partPath: string): string {
  // Check override first (exact match)
  if (result.overrides.has(partPath)) {
    return result.overrides.get(partPath)!
  }

  // Fall back to default by extension
  const ext = partPath.split('.').pop()?.toLowerCase() || ''
  if (result.defaults.has(ext)) {
    return result.defaults.get(ext)!
  }

  return 'application/octet-stream'
}

/**
 * Build content type map for all parts
 */
export function buildContentTypeMap(
  result: ContentTypesResult,
  partPaths: string[]
): Map<string, string> {
  const map = new Map<string, string>()

  for (const path of partPaths) {
    map.set(path, getContentType(result, path))
  }

  return map
}

/**
 * Detect document type from content types
 */
export function detectDocumentType(
  result: ContentTypesResult
): 'spreadsheet' | 'document' | 'presentation' | 'unknown' {
  // First pass: the package's *main* part is what decides the document type.
  // Embedded objects (e.g. a PPTX chart's backing xlsx) advertise their own
  // *ml content types and would otherwise win on a naive substring match.
  for (const entry of result.entries) {
    const ct = entry.contentType.toLowerCase()
    if (ct.includes('presentationml.presentation.main')) return 'presentation'
    if (ct.includes('wordprocessingml.document.main')) return 'document'
    if (ct.includes('spreadsheetml.sheet.main')) return 'spreadsheet'
  }

  for (const entry of result.entries) {
    const ct = entry.contentType.toLowerCase()
    if (ct.includes('presentationml') || ct.includes('presentation.main')) {
      return 'presentation'
    }
    if (ct.includes('wordprocessingml') || ct.includes('document.main')) {
      return 'document'
    }
    if (ct.includes('spreadsheetml') || ct.includes('sheet.main')) {
      return 'spreadsheet'
    }
  }

  return 'unknown'
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export { CONTENT_TYPES_PATH }
