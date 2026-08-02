import { PDFDocument, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { extractPageFonts, type ExtractedFont } from './pdfFontExtract'

let scratchDocPromise: Promise<PDFDocument> | null = null
async function getScratchDoc(): Promise<PDFDocument> {
  if (!scratchDocPromise) {
    scratchDocPromise = PDFDocument.create().then((d) => {
      d.registerFontkit(fontkit)
      return d
    })
  }
  return scratchDocPromise
}

// Cache of embedded PDFFont instances in the scratch doc, used only for
// width-matching decisions — never saved/exported.
const scratchFontCache = new Map<string, PDFFont | null>()

const MAX_WIDTH_ERROR = 0.35

/** Picks which embedded font (if any) in the source PDF page best matches a
 * given text run's measured width. Shared by the on-screen preview (which
 * loads the same bytes via FontFace) and the export step (which embeds the
 * same bytes via pdf-lib), so both measure/wrap text identically. Returns
 * null when there's nothing embedded, nothing parses, or no candidate's
 * width is close enough to trust — callers should fall back to Helvetica. */
export async function resolveParagraphFont(
  doc: PDFDocument,
  pageIndex: number,
  cacheKey: string,
  sampleText: string,
  sampleWidth: number,
  fontSize: number,
): Promise<ExtractedFont | null> {
  const candidates = await extractPageFonts(doc, pageIndex, cacheKey)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const scratch = await getScratchDoc()
  let best: { candidate: ExtractedFont; error: number } | null = null
  for (const candidate of candidates) {
    const fontCacheKey = `${cacheKey}:${pageIndex}:${candidate.resourceName}`
    let font = scratchFontCache.get(fontCacheKey)
    if (font === undefined) {
      try {
        font = await scratch.embedFont(candidate.bytes)
      } catch {
        font = null
      }
      scratchFontCache.set(fontCacheKey, font)
    }
    if (!font) continue
    const measured = font.widthOfTextAtSize(sampleText || 'x', fontSize)
    const error = Math.abs(measured - sampleWidth) / Math.max(1, sampleWidth)
    if (!best || error < best.error) best = { candidate, error }
  }
  if (!best || best.error > MAX_WIDTH_ERROR) return null
  return best.candidate
}
