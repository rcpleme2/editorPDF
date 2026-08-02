/** Greedy word-wrap: splits `text` into lines no wider than `maxWidth`,
 * using `measureWidth` to measure each candidate line. Works the same way
 * whether `measureWidth` is backed by a pdf-lib `PDFFont.widthOfTextAtSize`
 * (export) or a canvas `measureText` (on-screen preview/editing), so both
 * sides wrap identically as long as they're given equivalent fonts/sizes. */
export function wrapText(text: string, measureWidth: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (measureWidth(candidate) > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
  }
  return lines
}
