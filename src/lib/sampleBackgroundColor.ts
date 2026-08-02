import type { RGB } from '../types'

const WHITE: RGB = { r: 255, g: 255, b: 255 }
const BLACK: RGB = { r: 0, g: 0, b: 0 }

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export interface PageColors {
  /** Sampled next to the paragraph, for the covering rectangle's fill. */
  background: RGB
  /** The most background-distant pixel inside the sample run's box —
   * i.e. actual glyph ink rather than the whitespace between strokes. */
  text: RGB
}

/** Samples pixels from a rendered page image (a data: URL, already fully
 * in memory — decoding it for a small canvas read is effectively instant)
 * to pick colors that match the real document instead of hardcoded
 * white/black: the page background right next to a paragraph (so the
 * covering rectangle blends in), and — from within one representative text
 * run's bounding box — whichever pixel differs most from that background,
 * which is normally where a glyph's stroke actually is. Falls back to
 * white/black on any failure. */
export async function samplePageColors(
  imageUrl: string,
  backgroundPoint: { x: number; y: number },
  textBox: { left: number; top: number; width: number; height: number } | null,
): Promise<PageColors> {
  try {
    const img = await loadImage(imageUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return { background: WHITE, text: BLACK }
    ctx.drawImage(img, 0, 0)

    const bgX = clamp(Math.round(backgroundPoint.x), 0, canvas.width - 1)
    const bgY = clamp(Math.round(backgroundPoint.y), 0, canvas.height - 1)
    const [br, bg, bb] = ctx.getImageData(bgX, bgY, 1, 1).data
    const background: RGB = { r: br, g: bg, b: bb }

    let text: RGB = BLACK
    if (textBox && textBox.width > 0 && textBox.height > 0) {
      const x0 = clamp(Math.floor(textBox.left), 0, canvas.width - 1)
      const y0 = clamp(Math.floor(textBox.top), 0, canvas.height - 1)
      const w = clamp(Math.ceil(textBox.width), 1, canvas.width - x0)
      const h = clamp(Math.ceil(textBox.height), 1, canvas.height - y0)
      const data = ctx.getImageData(x0, y0, w, h).data
      let maxDist = -1
      for (let i = 0; i < data.length; i += 4) {
        const candidate: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] }
        const dist = colorDistance(candidate, background)
        if (dist > maxDist) {
          maxDist = dist
          text = candidate
        }
      }
      // No pixel meaningfully different from the background — likely
      // whitespace-only sample or a rendering quirk; black is a safer
      // default than whatever noise won the comparison.
      if (maxDist < 30) text = BLACK
    }

    return { background, text }
  } catch {
    return { background: WHITE, text: BLACK }
  }
}
