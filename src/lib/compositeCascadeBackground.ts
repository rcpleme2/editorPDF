import type { PdfViewport } from './pdfRender'
import { pdfBoxToScreen } from './geometry'
import { cascadeShiftAt, type CascadeBand } from './reflowCascade'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Redraws the page's rendered raster as a set of horizontal (in PDF space)
 * bands, each shifted by the cascade amount that applies to its position —
 * the visual half of the in-page reflow: without this, edited paragraphs'
 * boxes would move but the static page image behind them would not, so
 * content below an edit would visually overlap instead of being pushed.
 * Returns a new data URL, or the original bgUrl unchanged if there is
 * nothing to shift.
 */
export async function compositeCascadeBackground(
  bgUrl: string,
  viewport: PdfViewport,
  pageWidth: number,
  pageHeight: number,
  bands: CascadeBand[],
): Promise<string> {
  if (bands.length === 0) return bgUrl
  const img = await loadImage(bgUrl)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return bgUrl
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const breakpoints = Array.from(new Set(bands.map((b) => b.originalY))).sort((a, b) => b - a)
  const allBreaks = [pageHeight, ...breakpoints, 0]

  for (let i = 0; i < allBreaks.length - 1; i++) {
    const top = allBreaks[i]
    const bottom = allBreaks[i + 1]
    if (top - bottom < 0.01) continue
    const mid = (top + bottom) / 2
    const shift = cascadeShiftAt(bands, mid)

    const src = pdfBoxToScreen(viewport, 0, bottom, pageWidth, top - bottom)
    const dst = pdfBoxToScreen(viewport, 0, bottom + shift, pageWidth, top - bottom)

    const sx = Math.max(0, Math.round(src.left))
    const sy = Math.max(0, Math.round(src.top))
    const sw = Math.min(img.width - sx, Math.round(src.width))
    const sh = Math.min(img.height - sy, Math.round(src.height))
    if (sw <= 0 || sh <= 0) continue

    const dx = Math.round(dst.left)
    const dy = Math.round(dst.top)
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh)
  }

  return canvas.toDataURL('image/png')
}
