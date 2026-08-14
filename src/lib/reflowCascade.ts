import type { Annotation, ParagraphAnnotation } from '../types'

export interface CascadeBand {
  /** The edited paragraph's original bottom edge (PDF y) — the split/shift point. */
  originalY: number
  /** height - originalHeight, in PDF units. Positive = grew (pushes content below it down the page). */
  delta: number
}

/** Reads the current cascade-causing edits off a page's annotations: every
 * paragraph whose live height differs from its original footprint. This is
 * the entire "reflow state" for a page — no separate tracking needed,
 * since a paragraph's own x/y/height/originalY/originalHeight already
 * carry it. */
export function getCascadeBands(annotations: Annotation[]): CascadeBand[] {
  const bands: CascadeBand[] = []
  for (const a of annotations) {
    if (a.type !== 'paragraph') continue
    const delta = a.height - a.originalHeight
    if (delta !== 0) bands.push({ originalY: a.originalY, delta })
  }
  return bands
}

/** How far a point at the given *original* pdf-space y should move (added
 * to y) to account for every edited paragraph above it — this is the
 * entire cascade: content below a grown paragraph shifts down (negative,
 * since pdf space is y-up), content below a shrunk one shifts up. */
export function cascadeShiftAt(bands: CascadeBand[], originalY: number): number {
  let shift = 0
  for (const b of bands) {
    if (b.originalY > originalY) shift -= b.delta
  }
  return shift
}

/** The on-page shift to apply when rendering/exporting a given annotation:
 * paragraphs use their immutable originalY (so a paragraph never shifts
 * itself — only paragraphs strictly above it contribute), everything else
 * uses its current y directly (non-paragraph annotations don't grow, so
 * "current" and "original" are the same position for this purpose). */
export function shiftForAnnotation(ann: Annotation, bands: CascadeBand[]): number {
  const queryY = ann.type === 'paragraph' ? (ann as ParagraphAnnotation).originalY : ann.y
  return cascadeShiftAt(bands, queryY)
}
