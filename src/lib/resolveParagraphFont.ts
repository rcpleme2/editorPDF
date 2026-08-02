import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { extractPageFonts, type FontCandidate, type FontFamily } from './pdfFontExtract'

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

export function standardFontFor(family: FontFamily, bold: boolean, italic: boolean): StandardFonts {
  if (family === 'courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (family === 'times') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

export function cssFamilyFor(family: FontFamily): string {
  if (family === 'courier') return '"Courier New", Courier, monospace'
  if (family === 'times') return '"Times New Roman", Times, serif'
  return 'Helvetica, Arial, sans-serif'
}

// Cache of embedded PDFFont instances in the scratch doc, used only for
// width-matching decisions — never saved/exported.
const scratchFontCache = new Map<string, PDFFont | null>()

async function embedForMeasurement(scratch: PDFDocument, candidate: FontCandidate): Promise<PDFFont | null> {
  try {
    if (candidate.kind === 'embedded') return await scratch.embedFont(candidate.bytes)
    return await scratch.embedFont(standardFontFor(candidate.family, candidate.bold, candidate.italic))
  } catch {
    return null
  }
}

/** Picks which font (embedded, or a classified standard-family guess) on
 * the source PDF page best matches a given text run's measured width.
 * Shared by the on-screen preview and the export step, so both
 * measure/wrap text identically. Returns null only when the page has no
 * /Font resources at all — callers should fall back to Helvetica. */
export async function resolveParagraphFont(
  doc: PDFDocument,
  pageIndex: number,
  cacheKey: string,
  sampleText: string,
  sampleWidth: number,
  fontSize: number,
): Promise<FontCandidate | null> {
  const candidates = await extractPageFonts(doc, pageIndex, cacheKey)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const scratch = await getScratchDoc()
  let best: { candidate: FontCandidate; error: number } | null = null
  for (const candidate of candidates) {
    const fontCacheKey = `${cacheKey}:${pageIndex}:${candidate.resourceName}`
    let font = scratchFontCache.get(fontCacheKey)
    if (font === undefined) {
      font = await embedForMeasurement(scratch, candidate)
      scratchFontCache.set(fontCacheKey, font)
    }
    if (!font) continue
    const measured = font.widthOfTextAtSize(sampleText || 'x', fontSize)
    const error = Math.abs(measured - sampleWidth) / Math.max(1, sampleWidth)
    if (!best || error < best.error) best = { candidate, error }
  }
  // Every candidate here is at worst a classified standard-family guess
  // (never a blind Helvetica default), so — unlike a purely
  // embedded-fonts-only heuristic — the lowest measured error always wins;
  // there's no "not confident enough" case to fall further back from.
  return best ? best.candidate : candidates[0]
}
