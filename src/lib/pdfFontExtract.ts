import { PDFArray, PDFDict, PDFName, PDFStream, type PDFDocument } from 'pdf-lib'

export type FontFamily = 'helvetica' | 'times' | 'courier'

export type FontCandidate =
  | { kind: 'embedded'; resourceName: string; bytes: Uint8Array }
  | { kind: 'standard'; resourceName: string; family: FontFamily; bold: boolean; italic: boolean }

const cache = new Map<string, FontCandidate[]>()

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

/** Classifies a PDF /BaseFont name (e.g. "/Helvetica-Bold",
 * "/ABCDEF+TimesNewRomanPSMT", "/Arial,Italic") into a broad family plus
 * bold/italic — used for the many real-world fonts that are never embedded
 * (the standard 14 fonts, or a viewer-substituted equivalent), so they at
 * least render as the right kind of typeface (serif/monospace/sans)
 * instead of always defaulting to Helvetica. */
function classifyBaseFont(baseFont: string): { family: FontFamily; bold: boolean; italic: boolean } {
  // Subset fonts are prefixed "ABCDEF+RealName" per the PDF spec.
  const name = baseFont.replace(/^[A-Z]{6}\+/, '').toLowerCase()
  const family: FontFamily = /courier|mono|consolas|menlo/.test(name)
    ? 'courier'
    : /times|georgia|garamond|cambria|serif|minion|book|palatino|cambria/.test(name)
      ? 'times'
      : 'helvetica'
  const bold = /bold|black|heavy|semibold/.test(name)
  const italic = /italic|oblique/.test(name)
  return { family, bold, italic }
}

/** Extracts (or classifies) the fonts referenced by a page's /Font
 * resources, straight from the original document's low-level structure via
 * pdf-lib — independent of pdf.js's internal font aliasing. Every font
 * resource yields a candidate: an embedded TrueType/OpenType program when
 * one exists (best fidelity), or a classified standard-family guess from
 * its /BaseFont name otherwise (covers the very common case of PDFs using
 * the standard 14 fonts, which are never embedded). Only returns [] when
 * the page has no page-level /Resources or /Font dict at all. */
export async function extractPageFonts(
  doc: PDFDocument,
  pageIndex: number,
  cacheKey: string,
): Promise<FontCandidate[]> {
  const fullKey = `${cacheKey}:${pageIndex}`
  const cached = cache.get(fullKey)
  if (cached) return cached

  const results: FontCandidate[] = []
  try {
    const page = doc.getPage(pageIndex)
    const resources = page.node.Resources()
    const fontDictRefs = resources?.lookupMaybe(PDFName.of('Font'), PDFDict)
    if (fontDictRefs) {
      for (const [nameKey, ref] of fontDictRefs.entries()) {
        const resourceName = nameOf(nameKey) ?? nameKey.toString()
        try {
          const fontDict = doc.context.lookup(ref, PDFDict)
          let descriptor = fontDict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
          if (!descriptor) {
            const descendants = fontDict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
            const first = descendants && descendants.size() > 0 ? descendants.get(0) : undefined
            const descendantDict = first ? doc.context.lookup(first, PDFDict) : undefined
            descriptor = descendantDict?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
          }

          const fontFile = descriptor
            ? (descriptor.lookupMaybe(PDFName.of('FontFile2'), PDFStream) ??
              descriptor.lookupMaybe(PDFName.of('FontFile3'), PDFStream))
            : undefined

          if (fontFile) {
            const filterName = nameOf(fontFile.dict.get(PDFName.of('Filter')))
            const bytes = await inflateIfNeeded(fontFile.getContents(), filterName)
            if (bytes) {
              results.push({ kind: 'embedded', resourceName, bytes })
              continue
            }
          }

          // No embeddable font program — classify by /BaseFont name so we
          // at least pick the right family (serif/monospace/sans) and
          // weight/style instead of defaulting to Helvetica unconditionally.
          const baseFontName = nameOf(fontDict.get(PDFName.of('BaseFont'))) ?? ''
          results.push({ kind: 'standard', resourceName, ...classifyBaseFont(baseFontName) })
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
