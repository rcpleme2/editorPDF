import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore, type SourceEntry } from '../state/useEditorStore'
import { getPageTextItems, getPageViewport, renderPageToDataUrl, type PdfViewport } from '../lib/pdfRender'
import { pdfBoxToScreen, screenBoxToPdf, screenPointToPdf } from '../lib/geometry'
import { computePageScale } from '../lib/pageScale'
import { groupIntoParagraphs, findParagraphAt } from '../lib/textLayout'
import { AnnotationView } from './AnnotationView'
import type { Annotation, PageState, SearchMatch, TextItem, ToolId, RGB } from '../types'

const MIN_DRAG = 4

function newId() {
  return crypto.randomUUID()
}

export function PageView({
  page,
  entry,
  containerWidth,
  zoom,
  tool,
  strokeColor,
  fontSize,
  stampText,
  stampBold,
  stampFilled,
  isActive,
  onActivate,
  matches,
  activeMatchItemIndex,
}: {
  page: PageState
  entry: SourceEntry
  containerWidth: number
  zoom: number
  tool: ToolId
  strokeColor: RGB
  fontSize: number
  stampText: string
  stampBold: boolean
  stampFilled: boolean
  isActive: boolean
  onActivate: () => void
  matches: SearchMatch[]
  activeMatchItemIndex: number | null
}) {
  const addAnnotation = useEditorStore((s) => s.addAnnotation)
  const setSelectedAnnotation = useEditorStore((s) => s.setSelectedAnnotation)
  const setCropBox = useEditorStore((s) => s.setCropBox)
  const setTool = useEditorStore((s) => s.setTool)

  const [viewport, setViewport] = useState<PdfViewport | null>(null)
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [textItems, setTextItems] = useState<TextItem[]>([])
  const [draft, setDraft] = useState<{ type: string; left: number; top: number; width: number; height: number } | null>(null)
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[] | null>(null)
  const [cropRect, setCropRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const drawingRef = useRef<{ startX: number; startY: number } | null>(null)

  const { scale } = computePageScale(page, containerWidth, zoom)

  useEffect(() => {
    let cancelled = false
    setCropRect(null)
    Promise.all([
      getPageViewport(entry.renderDoc, page.sourcePageIndex, scale, page.rotation),
      renderPageToDataUrl(entry.renderDoc, page.sourcePageIndex, scale, page.rotation),
      getPageTextItems(entry.renderDoc, page.sourcePageIndex),
    ]).then(([vp, img, items]) => {
      if (cancelled) return
      setViewport(vp)
      setBgUrl(img.dataUrl)
      setTextItems(items)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, page.sourcePageIndex, page.rotation, scale])

  const paragraphs = useMemo(() => groupIntoParagraphs(textItems), [textItems])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!viewport) return
    onActivate()
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top

    if (tool === 'select') {
      setSelectedAnnotation(null)
      return
    }

    if (tool === 'text') {
      const pdfPoint = screenPointToPdf(viewport, localX, localY)
      const hit = findParagraphAt(paragraphs, pdfPoint.x, pdfPoint.y)
      if (hit) {
        const sample = hit.items.reduce((a, b) => (b.width > a.width ? b : a))
        addAnnotation(page.id, {
          id: newId(),
          type: 'paragraph',
          pageIndex: 0,
          x: hit.x,
          y: hit.y,
          width: hit.width + 4,
          height: hit.height * 1.2,
          fontSize: hit.fontSize,
          text: hit.text,
          isReplacement: true,
          bold: false,
          italic: false,
          sampleOriginalText: sample.text,
          sampleOriginalWidth: sample.width,
          color: { r: 0, g: 0, b: 0 },
        } as Annotation)
      } else {
        addAnnotation(page.id, {
          id: newId(),
          type: 'text',
          pageIndex: 0,
          x: pdfPoint.x,
          y: pdfPoint.y - fontSize * 1.2,
          width: 180,
          height: fontSize * 1.4,
          fontSize,
          text: '',
          isReplacement: false,
          bold: false,
          italic: false,
          color: strokeColor,
        } as Annotation)
      }
      setTool('select')
      return
    }

    if (tool === 'note') {
      const pdfPoint = screenPointToPdf(viewport, localX, localY)
      addAnnotation(page.id, {
        id: newId(),
        type: 'note',
        pageIndex: 0,
        x: pdfPoint.x,
        y: pdfPoint.y - 60,
        width: 140,
        height: 60,
        text: '',
        open: true,
        color: strokeColor,
      } as Annotation)
      setTool('select')
      return
    }

    if (tool === 'draw') {
      drawingRef.current = { startX: localX, startY: localY }
      const p0 = screenPointToPdf(viewport, localX, localY)
      setFreehandPoints([p0])
      window.addEventListener('pointermove', onFreehandMove)
      window.addEventListener('pointerup', onFreehandUp)
      return
    }

    if (tool === 'crop') {
      drawingRef.current = { startX: localX, startY: localY }
      setCropRect({ left: localX, top: localY, width: 0, height: 0 })
      window.addEventListener('pointermove', onCropMove)
      window.addEventListener('pointerup', onCropUp)
      return
    }

    // highlight, rect, circle, line, arrow: drag to create
    drawingRef.current = { startX: localX, startY: localY }
    setDraft({ type: tool, left: localX, top: localY, width: 0, height: 0 })
    window.addEventListener('pointermove', onDraftMove)
    window.addEventListener('pointerup', onDraftUp)

    function onFreehandMove(ev: PointerEvent) {
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const p = screenPointToPdf(viewport!, x, y)
      setFreehandPoints((pts) => (pts ? [...pts, p] : [p]))
    }
    function onFreehandUp() {
      window.removeEventListener('pointermove', onFreehandMove)
      window.removeEventListener('pointerup', onFreehandUp)
      setFreehandPoints((pts) => {
        if (pts && pts.length > 1) {
          const xs = pts.map((p) => p.x)
          const ys = pts.map((p) => p.y)
          addAnnotation(page.id, {
            id: newId(),
            type: 'freehand',
            pageIndex: 0,
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
            points: pts,
            strokeWidth: 2,
            color: strokeColor,
          } as Annotation)
        }
        return null
      })
    }

    function onCropMove(ev: PointerEvent) {
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const start = drawingRef.current!
      setCropRect({
        left: Math.min(start.startX, x),
        top: Math.min(start.startY, y),
        width: Math.abs(x - start.startX),
        height: Math.abs(y - start.startY),
      })
    }
    function onCropUp() {
      window.removeEventListener('pointermove', onCropMove)
      window.removeEventListener('pointerup', onCropUp)
    }

    function onDraftMove(ev: PointerEvent) {
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const start = drawingRef.current!
      setDraft({
        type: tool,
        left: Math.min(start.startX, x),
        top: Math.min(start.startY, y),
        width: Math.abs(x - start.startX),
        height: Math.abs(y - start.startY),
      })
    }
    function onDraftUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onDraftMove)
      window.removeEventListener('pointerup', onDraftUp)
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const start = drawingRef.current!
      const screenBox = {
        left: Math.min(start.startX, x),
        top: Math.min(start.startY, y),
        width: Math.abs(x - start.startX),
        height: Math.abs(y - start.startY),
      }
      setDraft(null)
      if (screenBox.width < MIN_DRAG && screenBox.height < MIN_DRAG) return
      if (tool === 'line' || tool === 'arrow') {
        const p1 = screenPointToPdf(viewport!, start.startX, start.startY)
        const p2 = screenPointToPdf(viewport!, x, y)
        addAnnotation(page.id, {
          id: newId(),
          type: tool,
          pageIndex: 0,
          x: p1.x,
          y: p1.y,
          x2: p2.x,
          y2: p2.y,
          width: 0,
          height: 0,
          strokeWidth: 2,
          color: strokeColor,
        } as Annotation)
        return
      }
      const pdfBox = screenBoxToPdf(viewport!, screenBox.left, screenBox.top, screenBox.width, screenBox.height)
      if (tool === 'highlight') {
        addAnnotation(page.id, {
          id: newId(),
          type: 'highlight',
          pageIndex: 0,
          ...pdfBox,
          opacity: 0.4,
          color: { r: 255, g: 230, b: 0 },
        } as Annotation)
      } else if (tool === 'rect' || tool === 'circle') {
        addAnnotation(page.id, {
          id: newId(),
          type: tool,
          pageIndex: 0,
          ...pdfBox,
          strokeWidth: 2,
          fill: false,
          color: strokeColor,
        } as Annotation)
      } else if (tool === 'stamp') {
        addAnnotation(page.id, {
          id: newId(),
          type: 'stamp',
          pageIndex: 0,
          ...pdfBox,
          text: stampText.trim() || 'CARIMBO',
          fontSize,
          bold: stampBold,
          filled: stampFilled,
          color: strokeColor,
        } as Annotation)
      }
    }
  }

  function applyCrop() {
    if (!cropRect || !viewport) return
    const pdfBox = screenBoxToPdf(viewport, cropRect.left, cropRect.top, cropRect.width, cropRect.height)
    setCropBox(page.id, pdfBox)
    setCropRect(null)
    setTool('select')
  }
  function cancelCrop() {
    setCropRect(null)
    setTool('select')
  }
  function removeCrop() {
    setCropBox(page.id, null)
  }

  const showFullPage = tool === 'crop'
  const cropScreen =
    viewport && page.cropBox && !showFullPage
      ? pdfBoxToScreen(viewport, page.cropBox.x, page.cropBox.y, page.cropBox.width, page.cropBox.height)
      : null

  return (
    <div className="page-canvas-wrapper" onPointerDownCapture={onActivate}>
      {isActive && tool === 'crop' && (
        <div className="crop-hint-bar">
          <span>Arraste para selecionar a área de corte.</span>
          {cropRect && (
            <>
              <button onClick={applyCrop}>Aplicar corte</button>
              <button onClick={cancelCrop}>Cancelar</button>
            </>
          )}
          {page.cropBox && !cropRect && <button onClick={removeCrop}>Remover corte atual</button>}
        </div>
      )}
      <div
        className="page-canvas-clip"
        style={
          viewport
            ? { width: cropScreen ? cropScreen.width : viewport.width, height: cropScreen ? cropScreen.height : viewport.height }
            : undefined
        }
      >
        <div
          className="page-canvas-surface"
          style={
            viewport
              ? {
                  width: viewport.width,
                  height: viewport.height,
                  left: cropScreen ? -cropScreen.left : 0,
                  top: cropScreen ? -cropScreen.top : 0,
                }
              : undefined
          }
          onPointerDown={handlePointerDown}
        >
          {bgUrl && <img src={bgUrl} className="page-canvas-bg" alt="Página" draggable={false} />}
          <svg width="0" height="0">
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={`rgb(${strokeColor.r},${strokeColor.g},${strokeColor.b})`} />
              </marker>
            </defs>
          </svg>
          {viewport &&
            page.annotations.map((ann) => (
              <AnnotationView
                key={ann.id}
                ann={ann}
                pageId={page.id}
                viewport={viewport}
                interactive={tool === 'select'}
                sourceDoc={entry.source.doc}
                sourcePageIndex={page.sourcePageIndex}
                cacheKey={entry.source.id}
              />
            ))}
          {viewport &&
            matches.map((m) => {
              const box = pdfBoxToScreen(viewport, m.item.x, m.item.y, m.item.width, m.item.height)
              const active = m.itemIndex === activeMatchItemIndex
              return (
                <div
                  key={m.itemIndex}
                  className={`search-highlight ${active ? 'active' : ''}`}
                  style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                />
              )
            })}
          {draft && (
            <div
              className={`draft-box draft-${draft.type}`}
              style={{ left: draft.left, top: draft.top, width: draft.width, height: draft.height }}
            />
          )}
          {freehandPoints && viewport && (
            <svg className="freehand-preview" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <polyline
                points={freehandPoints
                  .map((p) => {
                    const [sx, sy] = viewport.convertToViewportPoint(p.x, p.y)
                    return `${sx},${sy}`
                  })
                  .join(' ')}
                fill="none"
                stroke={`rgb(${strokeColor.r},${strokeColor.g},${strokeColor.b})`}
                strokeWidth={2}
              />
            </svg>
          )}
          {cropRect && (
            <div
              className="crop-overlay"
              style={{ left: cropRect.left, top: cropRect.top, width: cropRect.width, height: cropRect.height }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
