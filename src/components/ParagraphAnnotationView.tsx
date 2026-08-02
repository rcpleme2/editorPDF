import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocument } from 'pdf-lib'
import type { PdfViewport } from '../lib/pdfRender'
import { pdfBoxToScreen, screenPointToPdf } from '../lib/geometry'
import { resolveParagraphFont, cssFamilyFor } from '../lib/resolveParagraphFont'
import { wrapText } from '../lib/textWrap'
import { useEditorStore } from '../state/useEditorStore'
import type { Annotation, ParagraphAnnotation } from '../types'

function colorToCss(c: { r: number; g: number; b: number }) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}

let fontFaceCounter = 0
// cacheKey:pageIndex:resourceName -> CSS font-family name already registered via FontFace
const registeredFamilies = new Map<string, string>()

async function ensureFontFace(bytes: Uint8Array, familyCacheKey: string): Promise<string> {
  const existing = registeredFamilies.get(familyCacheKey)
  if (existing) return existing
  const family = `doc-font-${fontFaceCounter++}`
  const face = new FontFace(family, bytes.slice().buffer as ArrayBuffer)
  await face.load()
  document.fonts.add(face)
  registeredFamilies.set(familyCacheKey, family)
  return family
}

/** Resolves (once) which font this paragraph should use on screen: the
 * same embedded font as the source PDF (loaded as a real web font via
 * FontFace, so wrapping matches exactly), or — for the very common case of
 * non-embedded standard fonts — the matching CSS family (serif/monospace/
 * sans) so a Times or Courier document doesn't visually turn into
 * Helvetica. Only falls back to a generic sans-serif stack if resolution
 * fails outright. */
function useParagraphFontFamily(
  sourceDoc: PDFDocument,
  sourcePageIndex: number,
  cacheKey: string,
  sampleText: string,
  sampleWidth: number,
  fontSize: number,
): string {
  const [cssFamily, setCssFamily] = useState('Helvetica, Arial, sans-serif')

  useEffect(() => {
    let cancelled = false
    resolveParagraphFont(sourceDoc, sourcePageIndex, cacheKey, sampleText, sampleWidth, fontSize)
      .then(async (resolved) => {
        if (!resolved || cancelled) return
        if (resolved.kind === 'standard') {
          setCssFamily(cssFamilyFor(resolved.family))
          return
        }
        const familyKey = `${cacheKey}:${sourcePageIndex}:${resolved.resourceName}`
        const family = await ensureFontFace(resolved.bytes, familyKey)
        if (!cancelled) setCssFamily(`"${family}", Helvetica, Arial, sans-serif`)
      })
      .catch(() => {
        // Keep the Helvetica/Arial fallback.
      })
    return () => {
      cancelled = true
    }
  }, [sourceDoc, sourcePageIndex, cacheKey, sampleText, sampleWidth, fontSize])

  return cssFamily
}

export function ParagraphAnnotationView({
  ann,
  pageId,
  viewport,
  interactive,
  sourceDoc,
  sourcePageIndex,
  cacheKey,
}: {
  ann: ParagraphAnnotation
  pageId: string
  viewport: PdfViewport
  interactive: boolean
  sourceDoc: PDFDocument
  sourcePageIndex: number
  cacheKey: string
}) {
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation)
  const removeAnnotation = useEditorStore((s) => s.removeAnnotation)
  const selectedId = useEditorStore((s) => s.selectedAnnotationId)
  const setSelected = useEditorStore((s) => s.setSelectedAnnotation)
  const commitHistory = useEditorStore((s) => s.commitHistory)
  const dragRef = useRef<{ startScreenX: number; startScreenY: number; orig: Annotation } | null>(null)
  const [editing, setEditing] = useState(false)

  const selected = selectedId === ann.id
  const box = pdfBoxToScreen(viewport, ann.x, ann.y, ann.width, ann.height)

  const cssFontFamily = useParagraphFontFamily(
    sourceDoc,
    sourcePageIndex,
    cacheKey,
    ann.sampleOriginalText,
    ann.sampleOriginalWidth,
    ann.fontSize,
  )
  const cssFontSize = ann.fontSize * viewport.scale || 12

  const measure = useMemo(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    return (s: string) => {
      if (!ctx) return s.length * cssFontSize * 0.55
      ctx.font = `${ann.bold ? 'bold ' : ''}${ann.italic ? 'italic ' : ''}${cssFontSize}px ${cssFontFamily}`
      return ctx.measureText(s).width
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cssFontFamily, cssFontSize, ann.bold, ann.italic])

  // Used only to size the box (line count) — actual visual line breaks for
  // display are left to the browser's native wrapping (see textStyle
  // below), which handles justify/center/right correctly without fighting
  // manually-inserted line breaks.
  function countWrappedLines(text: string) {
    return Math.max(1, wrapText(text, measure, box.width).length)
  }

  function handleTextChange(newText: string) {
    const lineHeightPx = cssFontSize * 1.2
    const newHeightPx = Math.max(cssFontSize * 1.4, countWrappedLines(newText) * lineHeightPx)
    updateAnnotation(pageId, ann.id, { text: newText, height: newHeightPx / viewport.scale } as Partial<Annotation>)
  }

  function beginDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    if (!interactive) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { startScreenX: e.clientX, startScreenY: e.clientY, orig: ann }
    setSelected(ann.id)
    commitHistory()

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const { orig } = dragRef.current as { orig: ParagraphAnnotation }
      const startPdf = screenPointToPdf(viewport, dragRef.current.startScreenX, dragRef.current.startScreenY)
      const nowPdf = screenPointToPdf(viewport, ev.clientX, ev.clientY)
      const dx = nowPdf.x - startPdf.x
      const dy = nowPdf.y - startPdf.y
      if (mode === 'move') {
        updateAnnotation(pageId, ann.id, { x: orig.x + dx, y: orig.y + dy } as Partial<Annotation>)
      } else {
        const newWidth = Math.max(20, orig.width + dx)
        const newHeight = Math.max(8, orig.height - dy)
        updateAnnotation(pageId, ann.id, { width: newWidth, height: newHeight, y: orig.y + dy } as Partial<Annotation>)
      }
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    removeAnnotation(pageId, ann.id)
  }

  const textStyle: React.CSSProperties = {
    fontSize: cssFontSize,
    fontFamily: cssFontFamily,
    color: colorToCss(ann.color),
    fontWeight: ann.bold ? 'bold' : 'normal',
    fontStyle: ann.italic ? 'italic' : 'normal',
    textAlign: ann.align === 'justify' ? 'justify' : ann.align,
    // Justify shouldn't stretch the last visual line to fill the width.
    ...(ann.align === 'justify' ? { textAlignLast: 'left' as const } : {}),
    // Let the sampled page-background color on the parent show through
    // instead of .ann-textarea's semi-opaque white.
    background: 'transparent',
  }

  return (
    <div
      className={`ann-box ann-text ${selected ? 'selected' : ''}`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, background: colorToCss(ann.backgroundColor) }}
      onPointerDown={(e) => {
        if (!editing) beginDrag(e, 'move')
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        commitHistory()
        setEditing(true)
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          className="ann-textarea"
          style={textStyle}
          value={ann.text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <div className="ann-text-display ann-paragraph-display" style={textStyle}>
          {ann.text || <span className="placeholder">Digite o texto…</span>}
        </div>
      )}
      {selected && interactive && (
        <>
          <div className="ann-handle corner" style={{ right: -6, bottom: -6 }} onPointerDown={(e) => beginDrag(e, 'resize')} />
          <button className="ann-delete" style={{ right: -12, top: -12 }} onClick={handleDelete}>✕</button>
        </>
      )}
    </div>
  )
}
