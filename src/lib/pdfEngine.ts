import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { applyFormValues } from './pdfForms'
import { resolveParagraphFont, standardFontFor } from './resolveParagraphFont'
import { wrapText } from './textWrap'
import type { Annotation, FormFieldValue, PageState, RGB } from '../types'

export interface LoadedSource {
  id: string
  name: string
  bytes: ArrayBuffer
  doc: PDFDocument
}

export async function loadSourcePdf(name: string, bytes: ArrayBuffer): Promise<LoadedSource> {
  const doc = await PDFDocument.load(bytes)
  return { id: crypto.randomUUID(), name, bytes, doc }
}

export function makeInitialPages(sourceDocIndex: number, doc: PDFDocument): PageState[] {
  return doc.getPages().map((page, i) => {
    const { width, height } = page.getSize()
    return {
      id: crypto.randomUUID(),
      sourceDocIndex,
      sourcePageIndex: i,
      rotation: 0,
      cropBox: null,
      width,
      height,
      annotations: [],
    }
  })
}

function toColor(c: RGB) {
  return rgb(c.r / 255, c.g / 255, c.b / 255)
}

/** Converts native PDF-space points (y up) into the SVG-like path space that
 * pdf-lib's drawSvgPath expects (it applies scale(1,-1) internally), so a
 * point (x, y) here reproduces exactly at (x, y) in PDF space. */
function toSvgPoint(p: { x: number; y: number }) {
  return { x: p.x, y: -p.y }
}

function svgPathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const svgPoints = points.map(toSvgPoint)
  const [first, ...rest] = svgPoints
  return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ')
}

interface ParagraphFontContext {
  outDoc: PDFDocument
  sourceDoc: PDFDocument
  sourcePageIndex: number
  cacheKey: string
  fontCache: Map<string, PDFFont>
}

/** Resolves the PDFFont to draw a reflowed paragraph with: tries to reuse
 * the same font embedded in the source PDF, or — for the very common case
 * of non-embedded standard fonts (Times/Courier/Helvetica-family) —
 * embeds the matching pdf-lib StandardFont instead of always defaulting to
 * Helvetica (see resolveParagraphFont / pdfFontExtract's classification).
 * Embeds into the output document on first use and reuses that PDFFont
 * instance for every other paragraph using the same font. Falls back to
 * the given Helvetica variant only if resolution throws outright. */
async function resolveExportFont(
  ann: Extract<Annotation, { type: 'paragraph' }>,
  ctx: ParagraphFontContext,
  fallback: PDFFont,
): Promise<PDFFont> {
  try {
    const resolved = await resolveParagraphFont(
      ctx.sourceDoc,
      ctx.sourcePageIndex,
      ctx.cacheKey,
      ann.sampleOriginalText,
      ann.sampleOriginalWidth,
      ann.fontSize,
    )
    if (!resolved) return fallback
    const key = `${ctx.cacheKey}:${ctx.sourcePageIndex}:${resolved.resourceName}`
    let embedded = ctx.fontCache.get(key)
    if (!embedded) {
      if (resolved.kind === 'embedded') {
        ctx.outDoc.registerFontkit(fontkit)
        embedded = await ctx.outDoc.embedFont(resolved.bytes)
      } else {
        embedded = await ctx.outDoc.embedFont(standardFontFor(resolved.family, resolved.bold, resolved.italic))
      }
      ctx.fontCache.set(key, embedded)
    }
    return embedded
  } catch {
    return fallback
  }
}

/** Draws one wrapped line of a reflowed paragraph, honoring the detected
 * alignment. Justify distributes extra space evenly between words — except
 * on the last line of the paragraph, which is left-aligned per standard
 * typographic convention (and when a line is a single word, which can't be
 * stretched meaningfully). */
function drawParagraphLine(
  page: PDFPage,
  line: string,
  boxX: number,
  boxWidth: number,
  y: number,
  font: PDFFont,
  fontSize: number,
  color: ReturnType<typeof toColor>,
  align: Extract<Annotation, { type: 'paragraph' }>['align'],
  isLastLine: boolean,
) {
  if (align === 'justify' && !isLastLine) {
    const words = line.split(' ').filter(Boolean)
    if (words.length > 1) {
      const wordsWidth = words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, fontSize), 0)
      const gap = (boxWidth - wordsWidth) / (words.length - 1)
      let x = boxX
      for (const word of words) {
        page.drawText(word, { x, y, size: fontSize, font, color })
        x += font.widthOfTextAtSize(word, fontSize) + gap
      }
      return
    }
  }
  const lineWidth = font.widthOfTextAtSize(line, fontSize)
  let x = boxX
  if (align === 'right') x = boxX + (boxWidth - lineWidth)
  else if (align === 'center') x = boxX + (boxWidth - lineWidth) / 2
  page.drawText(line, { x, y, size: fontSize, font, color })
}

/** Draws one annotation onto a pdf-lib page. All annotation coordinates are
 * already in the page's native PDF user space (bottom-left origin, y up). */
async function drawAnnotation(
  page: import('pdf-lib').PDFPage,
  ann: Annotation,
  helv: import('pdf-lib').PDFFont,
  helvBold: import('pdf-lib').PDFFont,
  fontCtx: ParagraphFontContext,
) {
  switch (ann.type) {
    case 'text': {
      if (ann.isReplacement) {
        page.drawRectangle({
          x: ann.x,
          y: ann.y,
          width: ann.width,
          height: ann.height,
          color: rgb(1, 1, 1),
        })
      }
      const font = ann.bold ? helvBold : helv
      const lines = ann.text.split('\n')
      const lineHeight = ann.fontSize * 1.2
      const topY = ann.y + ann.height
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: ann.x,
          y: topY - lineHeight * (i + 1) + (lineHeight - ann.fontSize) / 2,
          size: ann.fontSize,
          font,
          color: toColor(ann.color),
        })
      })
      break
    }
    case 'highlight': {
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        color: toColor(ann.color),
        opacity: ann.opacity,
      })
      break
    }
    case 'rect': {
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        borderColor: toColor(ann.color),
        borderWidth: ann.strokeWidth,
        color: ann.fill ? toColor(ann.color) : undefined,
        opacity: ann.fill ? 0.3 : 1,
      })
      break
    }
    case 'circle': {
      page.drawEllipse({
        x: ann.x + ann.width / 2,
        y: ann.y + ann.height / 2,
        xScale: ann.width / 2,
        yScale: ann.height / 2,
        borderColor: toColor(ann.color),
        borderWidth: ann.strokeWidth,
        color: ann.fill ? toColor(ann.color) : undefined,
        opacity: ann.fill ? 0.3 : 1,
      })
      break
    }
    case 'line': {
      page.drawLine({
        start: { x: ann.x, y: ann.y },
        end: { x: ann.x2, y: ann.y2 },
        thickness: ann.strokeWidth,
        color: toColor(ann.color),
      })
      break
    }
    case 'arrow': {
      page.drawLine({
        start: { x: ann.x, y: ann.y },
        end: { x: ann.x2, y: ann.y2 },
        thickness: ann.strokeWidth,
        color: toColor(ann.color),
      })
      const angle = Math.atan2(ann.y2 - ann.y, ann.x2 - ann.x)
      const headLen = 10 + ann.strokeWidth * 2
      const tip = { x: ann.x2, y: ann.y2 }
      const p1 = {
        x: tip.x - headLen * Math.cos(angle - Math.PI / 6),
        y: tip.y - headLen * Math.sin(angle - Math.PI / 6),
      }
      const p2 = {
        x: tip.x - headLen * Math.cos(angle + Math.PI / 6),
        y: tip.y - headLen * Math.sin(angle + Math.PI / 6),
      }
      page.drawSvgPath(svgPathFromPoints([tip, p1, p2, tip]), { color: toColor(ann.color) })
      break
    }
    case 'freehand': {
      page.drawSvgPath(svgPathFromPoints(ann.points), {
        borderColor: toColor(ann.color),
        borderWidth: ann.strokeWidth,
        borderOpacity: 1,
      })
      break
    }
    case 'note': {
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        color: rgb(1, 0.92, 0.4),
        borderColor: rgb(0.8, 0.65, 0),
        borderWidth: 1,
      })
      const fontSize = 9
      const maxCharsPerLine = Math.max(6, Math.floor(ann.width / (fontSize * 0.55)))
      const words = ann.text.split(/\s+/)
      const lines: string[] = []
      let current = ''
      for (const w of words) {
        if ((current + ' ' + w).trim().length > maxCharsPerLine) {
          lines.push(current.trim())
          current = w
        } else {
          current = (current + ' ' + w).trim()
        }
      }
      if (current) lines.push(current)
      const topY = ann.y + ann.height
      lines.slice(0, Math.floor(ann.height / (fontSize + 2))).forEach((line, i) => {
        page.drawText(line, {
          x: ann.x + 4,
          y: topY - (fontSize + 2) * (i + 1),
          size: fontSize,
          font: helv,
          color: rgb(0.2, 0.2, 0.2),
        })
      })
      break
    }
    case 'stamp': {
      if (ann.filled) {
        page.drawRectangle({
          x: ann.x,
          y: ann.y,
          width: ann.width,
          height: ann.height,
          color: toColor(ann.color),
          opacity: 0.15,
        })
      }
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        borderColor: toColor(ann.color),
        borderWidth: 2,
      })
      const font = ann.bold ? helvBold : helv
      const lines = ann.text.split('\n')
      const lineHeight = ann.fontSize * 1.2
      const blockHeight = lineHeight * lines.length
      const topY = ann.y + ann.height / 2 + blockHeight / 2
      lines.forEach((line, i) => {
        const textWidth = font.widthOfTextAtSize(line, ann.fontSize)
        page.drawText(line, {
          x: ann.x + (ann.width - textWidth) / 2,
          y: topY - lineHeight * (i + 1) + (lineHeight - ann.fontSize) / 2,
          size: ann.fontSize,
          font,
          color: toColor(ann.color),
        })
      })
      break
    }
    case 'paragraph': {
      page.drawRectangle({
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
        color: toColor(ann.backgroundColor),
      })
      const font = await resolveExportFont(ann, fontCtx, ann.bold ? helvBold : helv)
      const lines = wrapText(ann.text, (s) => font.widthOfTextAtSize(s, ann.fontSize), ann.width)
      const lineHeight = ann.fontSize * 1.2
      const topY = ann.y + ann.height
      const color = toColor(ann.color)
      lines.forEach((line, i) => {
        drawParagraphLine(
          page,
          line,
          ann.x,
          ann.width,
          topY - lineHeight * (i + 1) + (lineHeight - ann.fontSize) / 2,
          font,
          ann.fontSize,
          color,
          ann.align,
          i === lines.length - 1,
        )
      })
      break
    }
  }
}

/** Builds the final exported PDF from the ordered list of PageState entries,
 * pulling pages from their respective source PDFDocuments and applying
 * crop/rotation/annotations. */
export async function exportPdf(
  sources: LoadedSource[],
  pages: PageState[],
  formValues?: Record<number, Record<string, FormFieldValue>>,
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const helv = await out.embedFont(StandardFonts.Helvetica)
  const helvBold = await out.embedFont(StandardFonts.HelveticaBold)

  // Filling + flattening a form mutates the document, so it's done once per
  // source (on a clone, never the shared in-memory doc) and reused for every
  // page pulled from that source.
  const docsForExport = new Map<number, PDFDocument>()
  async function getDocForExport(sourceDocIndex: number): Promise<PDFDocument> {
    const cached = docsForExport.get(sourceDocIndex)
    if (cached) return cached
    const source = sources[sourceDocIndex]
    const values = formValues?.[sourceDocIndex]
    let doc = source.doc
    if (values && Object.keys(values).length > 0) {
      doc = await PDFDocument.load(await source.doc.save())
      applyFormValues(doc, values)
    }
    docsForExport.set(sourceDocIndex, doc)
    return doc
  }

  // Shared across the whole export so the same source font is only
  // embedded into the output document once, however many paragraphs (on
  // however many pages) end up using it.
  const paragraphFontCache = new Map<string, PDFFont>()

  for (const p of pages) {
    const sourceDoc = await getDocForExport(p.sourceDocIndex)
    const [copied] = await out.copyPages(sourceDoc, [p.sourcePageIndex])
    out.addPage(copied)

    if (p.rotation) copied.setRotation(degrees(p.rotation))
    if (p.cropBox) {
      copied.setCropBox(p.cropBox.x, p.cropBox.y, p.cropBox.width, p.cropBox.height)
    }

    const fontCtx: ParagraphFontContext = {
      outDoc: out,
      sourceDoc: sources[p.sourceDocIndex].doc,
      sourcePageIndex: p.sourcePageIndex,
      cacheKey: sources[p.sourceDocIndex].id,
      fontCache: paragraphFontCache,
    }
    for (const ann of p.annotations) {
      await drawAnnotation(copied, ann, helv, helvBold, fontCtx)
    }
  }

  return out.save()
}

