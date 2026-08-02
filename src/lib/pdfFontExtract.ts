import { PDFArray, PDFDict, PDFName, PDFStream, type PDFDocument } from 'pdf-lib'

export interface ExtractedFont {
  resourceName: string
  bytes: Uint8Array
}

const cache = new Map<string, ExtractedFont[]>()

async function inflateIfNeeded(bytes: Uint8Array, filterName: string | undefined): Promise<Uint8Array | null> {
  if (!filterName) return bytes
  if (filterName !== '/FlateDecode') {
    // Any other/chained filter (ASCII85Decode, multi-filter arrays, etc.) —
    // not worth the complexity/risk of decoding here; treat as unextractable.
    return null
  }
  try {
    // PDF's FlateDecode is zlib-wrapped deflate — the browser's 'deflate'
    // format (as opposed to 'deflate-raw') expects exactly that framing.
    const ds = new DecompressionStream('deflate')
    const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(ds)
    const buf = await new Response(stream).arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

function nameOf(obj: unknown): string | undefined {
  return obj instanceof PDFName ? obj.asString() : undefined
}

/** Extracts embedded font programs (TrueType/OpenType) referenced by a
 * page's /Font resources, straight from the original document's low-level
 * structure via pdf-lib — independent of pdf.js's internal font aliasing.
 * Returns [] for pages with no page-level /Resources, no fonts, or only
 * non-embeddable font types (Type1, multi-filter streams, etc.). */
export async function extractPageFonts(
  doc: PDFDocument,
  pageIndex: number,
  cacheKey: string,
): Promise<ExtractedFont[]> {
  const fullKey = `${cacheKey}:${pageIndex}`
  const cached = cache.get(fullKey)
  if (cached) return cached

  const results: ExtractedFont[] = []
  try {
    const page = doc.getPage(pageIndex)
    const resources = page.node.Resources()
    const fontDictRefs = resources?.lookupMaybe(PDFName.of('Font'), PDFDict)
    if (fontDictRefs) {
      for (const [nameKey, ref] of fontDictRefs.entries()) {
        try {
          const fontDict = doc.context.lookup(ref, PDFDict)
          let descriptor = fontDict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
          if (!descriptor) {
            const descendants = fontDict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
            const first = descendants && descendants.size() > 0 ? descendants.get(0) : undefined
            const descendantDict = first ? doc.context.lookup(first, PDFDict) : undefined
            descriptor = descendantDict?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
          }
          if (!descriptor) continue

          const fontFile =
            descriptor.lookupMaybe(PDFName.of('FontFile2'), PDFStream) ??
            descriptor.lookupMaybe(PDFName.of('FontFile3'), PDFStream)
          if (!fontFile) continue

          const filterName = nameOf(fontFile.dict.get(PDFName.of('Filter')))
          const bytes = await inflateIfNeeded(fontFile.getContents(), filterName)
          if (!bytes) continue

          results.push({ resourceName: nameOf(nameKey) ?? nameKey.toString(), bytes })
        } catch {
          // Skip this font resource; others may still be usable.
        }
      }
    }
  } catch {
    // No usable resources on this page — fall through with whatever we have (possibly none).
  }

  cache.set(fullKey, results)
  return results
}
