import type { TextItem } from '../types'

export interface ParagraphBlock {
  /** Plain text with line breaks collapsed to spaces — meant to be re-wrapped, not displayed as-is. */
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  items: TextItem[]
}

interface Line {
  items: TextItem[]
  y: number
  x0: number
  x1: number
  fontSize: number
}

function groupIntoLines(items: TextItem[]): Line[] {
  const lines: Line[] = []
  for (const item of items) {
    const tolerance = Math.max(2, item.fontSize * 0.3)
    let line = lines.find((l) => Math.abs(l.y - item.y) <= tolerance)
    if (!line) {
      line = { items: [], y: item.y, x0: item.x, x1: item.x + item.width, fontSize: item.fontSize }
      lines.push(line)
    }
    line.items.push(item)
    line.x0 = Math.min(line.x0, item.x)
    line.x1 = Math.max(line.x1, item.x + item.width)
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x)
  // Native PDF space is y-up, so a higher y is higher on the page — sort
  // top to bottom for natural reading order.
  lines.sort((a, b) => b.y - a.y)
  return lines
}

/** Groups extracted text runs into paragraph-like blocks using layout
 * heuristics (line spacing, font size, left-edge alignment) — pdf.js gives
 * us positioned text runs with no notion of "paragraph". A paragraph ends
 * when the gap to the next line is too big for the current line height, the
 * font size changes, or the line's left edge shifts noticeably (a new
 * heading/list item/column). */
export function groupIntoParagraphs(items: TextItem[]): ParagraphBlock[] {
  const lines = groupIntoLines(items)
  const paragraphs: ParagraphBlock[] = []
  let current: Line[] = []

  function flush() {
    if (current.length === 0) return
    const allItems = current.flatMap((l) => l.items)
    const text = current
      .map((l) => l.items.map((i) => i.text).join(' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const x = Math.min(...allItems.map((i) => i.x))
    const y = Math.min(...allItems.map((i) => i.y))
    const width = Math.max(...allItems.map((i) => i.x + i.width)) - x
    const height = Math.max(...allItems.map((i) => i.y + i.height)) - y
    paragraphs.push({ text, x, y, width, height, fontSize: current[0].fontSize, items: allItems })
    current = []
  }

  for (const line of lines) {
    if (current.length === 0) {
      current.push(line)
      continue
    }
    const prev = current[current.length - 1]
    const gap = prev.y - line.y
    const maxLineGap = prev.fontSize * 1.6
    const sameFontSize = Math.abs(prev.fontSize - line.fontSize) < 0.5
    const similarStartX = Math.abs(prev.x0 - line.x0) < prev.fontSize * 2
    if (gap >= 0 && gap <= maxLineGap && sameFontSize && similarStartX) {
      current.push(line)
    } else {
      flush()
      current.push(line)
    }
  }
  flush()

  return paragraphs
}

/** Finds the paragraph block whose bounding box contains the given PDF-space point. */
export function findParagraphAt(paragraphs: ParagraphBlock[], x: number, y: number): ParagraphBlock | null {
  for (const p of paragraphs) {
    if (x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height) return p
  }
  return null
}
