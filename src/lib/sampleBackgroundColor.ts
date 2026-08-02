import type { RGB } from '../types'

const WHITE: RGB = { r: 255, g: 255, b: 255 }

/** Samples a single pixel from a rendered page image (a data: URL, already
 * fully in memory — decoding it for a 1px canvas read is effectively
 * instant) at the given pixel coordinates. Used to pick a covering
 * rectangle's fill color that blends with the actual page background
 * (rarely pure white) instead of leaving a visible white patch. Falls back
 * to white on any failure — same as the previous hardcoded behavior. */
export function sampleBackgroundColor(imageUrl: string, xPx: number, yPx: number): Promise<RGB> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(WHITE)
          return
        }
        ctx.drawImage(img, 0, 0)
        const x = Math.max(0, Math.min(canvas.width - 1, Math.round(xPx)))
        const y = Math.max(0, Math.min(canvas.height - 1, Math.round(yPx)))
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
        resolve({ r, g, b })
      } catch {
        resolve(WHITE)
      }
    }
    img.onerror = () => resolve(WHITE)
    img.src = imageUrl
  })
}
