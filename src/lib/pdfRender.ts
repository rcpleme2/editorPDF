import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { TextItem } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type PdfDocProxy = pdfjsLib.PDFDocumentProxy
export type PdfViewport = ReturnType<pdfjsLib.PDFPageProxy['getViewport']>

export async function loadPdfDocument(data: ArrayBuffer): Promise<PdfDocProxy> {
  const task = pdfjsLib.getDocument({ data })
  return task.promise
}

export async function getPageSize(doc: PdfDocProxy, pageIndex: number) {
  const page = await doc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  return { width: viewport.width, height: viewport.height }
}

/** Returns a pdf.js viewport for a page; use its convertToPdfPoint/convertToViewportPoint
 * helpers to map between on-screen pixels (rotation + scale aware) and native PDF space. */
export async function getPageViewport(
  doc: PdfDocProxy,
  pageIndex: number,
  scale: number,
  rotation = 0,
): Promise<PdfViewport> {
  const page = await doc.getPage(pageIndex + 1)
  return page.getViewport({ scale, rotation })
}

/** Renders a page to a canvas at the given scale/rotation. Returns a data URL. */
export async function renderPageToDataUrl(
  doc: PdfDocProxy,
  pageIndex: number,
  scale: number,
  rotation = 0,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const page = await doc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

/** Extracts text items in native PDF user space (origin bottom-left, y up), independent of rotation. */
export async function getPageTextItems(doc: PdfDocProxy, pageIndex: number): Promise<TextItem[]> {
  const page = await doc.getPage(pageIndex + 1)
  const content = await page.getTextContent()
  const items: TextItem[] = []
  for (const raw of content.items) {
    if (!('str' in raw) || !raw.str.trim()) continue
    const transform = raw.transform as number[]
    const [a, b, c, d, e, f] = transform
    const fontSize = Math.hypot(a, b) || Math.hypot(c, d)
    const width = raw.width || 0
    const descent = fontSize * 0.2
    items.push({
      text: raw.str,
      x: e,
      y: f - descent,
      width,
      height: fontSize,
      fontSize,
      fontName: raw.fontName ?? 'helv',
    })
  }
  return items
}
