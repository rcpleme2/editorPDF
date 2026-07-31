import type { PdfViewport } from './pdfRender'

export function screenPointToPdf(viewport: PdfViewport, x: number, y: number) {
  const [px, py] = viewport.convertToPdfPoint(x, y)
  return { x: px, y: py }
}

export function pdfPointToScreen(viewport: PdfViewport, x: number, y: number) {
  const [sx, sy] = viewport.convertToViewportPoint(x, y)
  return { x: sx, y: sy }
}

/** Converts a PDF-space axis-aligned box (bottom-left origin, y up) into a
 * screen-space axis-aligned box (top-left origin, y down), correctly
 * handling any of the four 90-degree page rotations. */
export function pdfBoxToScreen(
  viewport: PdfViewport,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const corners = [
    pdfPointToScreen(viewport, x, y),
    pdfPointToScreen(viewport, x + width, y),
    pdfPointToScreen(viewport, x, y + height),
    pdfPointToScreen(viewport, x + width, y + height),
  ]
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

/** Inverse of pdfBoxToScreen: given a screen-space AABB, returns the PDF-space AABB. */
export function screenBoxToPdf(
  viewport: PdfViewport,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const corners = [
    screenPointToPdf(viewport, left, top),
    screenPointToPdf(viewport, left + width, top),
    screenPointToPdf(viewport, left, top + height),
    screenPointToPdf(viewport, left + width, top + height),
  ]
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
