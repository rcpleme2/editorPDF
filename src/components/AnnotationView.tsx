import { useRef, useState } from 'react'
import type { PDFDocument } from 'pdf-lib'
import type { PdfViewport } from '../lib/pdfRender'
import { pdfBoxToScreen, pdfPointToScreen, screenPointToPdf } from '../lib/geometry'
import { useEditorStore } from '../state/useEditorStore'
import { ParagraphAnnotationView } from './ParagraphAnnotationView'
import type { Annotation } from '../types'

function colorToCss(c: { r: number; g: number; b: number }, alpha = 1) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
}

export function AnnotationView({
  ann,
  pageId,
  viewport,
  interactive,
  sourceDoc,
  sourcePageIndex,
  cacheKey,
}: {
  ann: Annotation
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

  function beginDrag(e: React.PointerEvent, mode: 'move' | 'resize' | 'p1' | 'p2') {
    if (!interactive) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { startScreenX: e.clientX, startScreenY: e.clientY, orig: ann }
    setSelected(ann.id)
    commitHistory()

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const { orig } = dragRef.current
      const startPdf = screenPointToPdf(viewport, dragRef.current.startScreenX, dragRef.current.startScreenY)
      const nowPdf = screenPointToPdf(viewport, ev.clientX, ev.clientY)
      const dx = nowPdf.x - startPdf.x
      const dy = nowPdf.y - startPdf.y

      if (mode === 'move' && orig.type === 'freehand') {
        updateAnnotation(pageId, ann.id, {
          x: orig.x + dx,
          y: orig.y + dy,
          points: orig.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        } as Partial<Annotation>)
      } else if (mode === 'move') {
        updateAnnotation(pageId, ann.id, { x: orig.x + dx, y: orig.y + dy } as Partial<Annotation>)
      } else if (mode === 'resize' && 'width' in orig) {
        const newWidth = Math.max(8, orig.width + dx)
        const newHeight = Math.max(8, orig.height - dy)
        const newY = orig.y + dy
        updateAnnotation(pageId, ann.id, {
          width: newWidth,
          height: newHeight,
          y: newY,
        } as Partial<Annotation>)
      } else if (mode === 'p2' && (orig.type === 'line' || orig.type === 'arrow')) {
        updateAnnotation(pageId, ann.id, { x2: orig.x2 + dx, y2: orig.y2 + dy } as Partial<Annotation>)
      } else if (mode === 'p1' && (orig.type === 'line' || orig.type === 'arrow')) {
        updateAnnotation(pageId, ann.id, { x: orig.x + dx, y: orig.y + dy } as Partial<Annotation>)
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

  const commonBoxStyle = (() => {
    if (ann.type === 'line' || ann.type === 'arrow') return null
    const box = pdfBoxToScreen(viewport, ann.x, ann.y, ann.width, ann.height)
    return box
  })()

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    removeAnnotation(pageId, ann.id)
  }

  if (ann.type === 'line' || ann.type === 'arrow') {
    const p1 = pdfBoxToScreen(viewport, ann.x, ann.y, 0, 0)
    const p2 = pdfBoxToScreen(viewport, ann.x2, ann.y2, 0, 0)
    return (
      <>
        <svg className="ann-line-svg" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          <line
            x1={p1.left}
            y1={p1.top}
            x2={p2.left}
            y2={p2.top}
            stroke={colorToCss(ann.color)}
            strokeWidth={ann.strokeWidth}
            markerEnd={ann.type === 'arrow' ? 'url(#arrowhead)' : undefined}
            style={{ pointerEvents: interactive ? 'stroke' : 'none', cursor: interactive ? 'move' : 'default' }}
            onPointerDown={(e) => beginDrag(e, 'move')}
          />
        </svg>
        {selected && interactive && (
          <>
            <div
              className="ann-handle endpoint"
              style={{ left: p1.left - 6, top: p1.top - 6 }}
              onPointerDown={(e) => beginDrag(e, 'p1')}
            />
            <div
              className="ann-handle endpoint"
              style={{ left: p2.left - 6, top: p2.top - 6 }}
              onPointerDown={(e) => beginDrag(e, 'p2')}
            />
            <button
              className="ann-delete"
              style={{ left: (p1.left + p2.left) / 2, top: (p1.top + p2.top) / 2 }}
              onClick={handleDelete}
            >
              ✕
            </button>
          </>
        )}
      </>
    )
  }

  const box = commonBoxStyle!

  if (ann.type === 'paragraph') {
    return (
      <ParagraphAnnotationView
        ann={ann}
        pageId={pageId}
        viewport={viewport}
        interactive={interactive}
        sourceDoc={sourceDoc}
        sourcePageIndex={sourcePageIndex}
        cacheKey={cacheKey}
      />
    )
  }

  if (ann.type === 'text') {
    return (
      <div
        className={`ann-box ann-text ${selected ? 'selected' : ''}`}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          background: ann.isReplacement ? 'white' : 'transparent',
        }}
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
            style={{
              fontSize: (ann.fontSize * viewport.scale) || 12,
              color: colorToCss(ann.color),
              fontWeight: ann.bold ? 'bold' : 'normal',
              fontStyle: ann.italic ? 'italic' : 'normal',
            }}
            value={ann.text}
            onChange={(e) => updateAnnotation(pageId, ann.id, { text: e.target.value })}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <div
            className="ann-text-display"
            style={{
              fontSize: (ann.fontSize * viewport.scale) || 12,
              color: colorToCss(ann.color),
              fontWeight: ann.bold ? 'bold' : 'normal',
              fontStyle: ann.italic ? 'italic' : 'normal',
            }}
          >
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

  if (ann.type === 'note') {
    return (
      <div
        className={`ann-box ann-note ${selected ? 'selected' : ''}`}
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
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
            className="ann-textarea note-textarea"
            value={ann.text}
            onChange={(e) => updateAnnotation(pageId, ann.id, { text: e.target.value })}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <div className="note-text">{ann.text || 'Nota…'}</div>
        )}
        {selected && interactive && (
          <button className="ann-delete" style={{ right: -12, top: -12 }} onClick={handleDelete}>✕</button>
        )}
      </div>
    )
  }

  if (ann.type === 'highlight') {
    return (
      <div
        className={`ann-box ann-highlight ${selected ? 'selected' : ''}`}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          background: colorToCss(ann.color, ann.opacity),
          cursor: interactive ? 'move' : 'default',
        }}
        onPointerDown={(e) => beginDrag(e, 'move')}
      >
        {selected && interactive && (
          <>
            <div className="ann-handle corner" style={{ right: -6, bottom: -6 }} onPointerDown={(e) => beginDrag(e, 'resize')} />
            <button className="ann-delete" style={{ right: -12, top: -12 }} onClick={handleDelete}>✕</button>
          </>
        )}
      </div>
    )
  }

  if (ann.type === 'freehand') {
    const screenPoints = ann.points.map((p) => pdfPointToScreen(viewport, p.x, p.y))
    return (
      <>
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          <polyline
            points={screenPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={colorToCss(ann.color)}
            strokeWidth={ann.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: interactive ? 'stroke' : 'none', cursor: interactive ? 'move' : 'default' }}
            onPointerDown={(e) => beginDrag(e, 'move')}
          />
        </svg>
        {selected && interactive && (
          <button
            className="ann-delete"
            style={{ left: box.left + box.width, top: box.top }}
            onClick={handleDelete}
          >
            ✕
          </button>
        )}
      </>
    )
  }

  if (ann.type === 'stamp') {
    return (
      <div
        className={`ann-box ann-stamp ${selected ? 'selected' : ''}`}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          border: `2px solid ${colorToCss(ann.color)}`,
          background: ann.filled ? colorToCss(ann.color, 0.15) : 'transparent',
          color: colorToCss(ann.color),
          fontWeight: ann.bold ? 'bold' : 'normal',
          fontSize: ann.fontSize * viewport.scale || 12,
          cursor: interactive ? 'move' : 'default',
        }}
        onPointerDown={(e) => beginDrag(e, 'move')}
      >
        <span className="ann-stamp-text">{ann.text}</span>
        {selected && interactive && (
          <>
            <div className="ann-handle corner" style={{ right: -6, bottom: -6 }} onPointerDown={(e) => beginDrag(e, 'resize')} />
            <button className="ann-delete" style={{ right: -12, top: -12 }} onClick={handleDelete}>✕</button>
          </>
        )}
      </div>
    )
  }

  // rect / circle
  return (
    <div
      className={`ann-box ${selected ? 'selected' : ''}`}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        border: `${ann.strokeWidth}px solid ${colorToCss(ann.color)}`,
        borderRadius: ann.type === 'circle' ? '50%' : 0,
        background: ann.fill ? colorToCss(ann.color, 0.3) : 'transparent',
        cursor: interactive ? 'move' : 'default',
      }}
      onPointerDown={(e) => beginDrag(e, 'move')}
    >
      {selected && interactive && (
        <>
          <div className="ann-handle corner" style={{ right: -6, bottom: -6 }} onPointerDown={(e) => beginDrag(e, 'resize')} />
          <button className="ann-delete" style={{ right: -12, top: -12 }} onClick={handleDelete}>✕</button>
        </>
      )}
    </div>
  )
}
