import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import { applyFormValues } from './pdfForms'
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

/** Draws one annotation onto a pdf-lib page. All annotation coordinates are
 * already in the page's native PDF user space (bottom-left origin, y up). */
async function drawAnnotation(
  page: import('pdf-lib').PDFPage,
  ann: Annotation,
  helv: import('pdf-lib').PDFFont,
  helvBold: import('pdf-lib').PDFFont,
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

  for (const p of pages) {
    const sourceDoc = await getDocForExport(p.sourceDocIndex)
    const [copied] = await out.copyPages(sourceDoc, [p.sourcePageIndex])
    out.addPage(copied)

    if (p.rotation) copied.setRotation(degrees(p.rotation))
    if (p.cropBox) {
      copied.setCropBox(p.cropBox.x, p.cropBox.y, p.cropBox.width, p.cropBox.height)
    }

    for (const ann of p.annotations) {
      await drawAnnotation(copied, ann, helv, helvBold)
    }
  }

  return out.save()
}

