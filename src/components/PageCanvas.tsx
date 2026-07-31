import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { PageView } from './PageView'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

export function PageCanvas() {
  const pages = useEditorStore((s) => s.pages)
  const sources = useEditorStore((s) => s.sources)
  const currentPageId = useEditorStore((s) => s.currentPageId)
  const navigateToken = useEditorStore((s) => s.navigateToken)
  const navigateTargetId = useEditorStore((s) => s.navigateTargetId)
  const tool = useEditorStore((s) => s.tool)
  const strokeColor = useEditorStore((s) => s.strokeColor)
  const fontSize = useEditorStore((s) => s.fontSize)
  const setActivePage = useEditorStore((s) => s.setActivePage)

  const outerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<string, HTMLDivElement>())
  const [containerWidth, setContainerWidth] = useState(800)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(Math.max(300, w - 32))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Track which page is most visible in the scroll container and mark it
  // "active" (used for the crop hint bar and to keep the sidebar in sync),
  // without disturbing tool/selection state the way an explicit navigation would.
  useEffect(() => {
    const scrollRoot = outerRef.current?.closest('.app-main')
    if (!scrollRoot) return
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { id: string; ratio: number } | null = null
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.pageId
          if (!id) continue
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.ratio)) {
            best = { id, ratio: entry.intersectionRatio }
          }
        }
        if (best) setActivePage(best.id)
      },
      { root: scrollRoot, threshold: [0.15, 0.35, 0.55, 0.75] },
    )
    for (const el of pageRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [pages, setActivePage])

  // Explicit "jump to this page" request (sidebar click) — scroll it into
  // view. Driven by navigateToken (not currentPageId) so that currentPageId
  // simply following the user's own scroll never triggers a re-scroll.
  useEffect(() => {
    if (navigateToken === 0 || !navigateTargetId) return
    const el = pageRefs.current.get(navigateTargetId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateToken])

  function zoomIn() {
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))
  }
  function zoomOut() {
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))
  }
  function resetZoom() {
    setZoom(1)
  }

  if (pages.length === 0) {
    return (
      <div className="page-canvas-empty">
        <p>Selecione ou carregue um PDF para começar a editar.</p>
      </div>
    )
  }

  return (
    <div className="page-canvas-outer" ref={outerRef}>
      <div className="zoom-controls">
        <button title="Diminuir zoom" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>−</button>
        <button title="Ajustar à largura" className="zoom-percent" onClick={resetZoom}>
          {Math.round(zoom * 100)}%
        </button>
        <button title="Aumentar zoom" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>+</button>
      </div>
      <div className="page-canvas-stack">
        {pages.map((page, i) => {
          const entry = sources[page.sourceDocIndex]
          if (!entry) return null
          return (
            <div
              key={page.id}
              ref={(el) => {
                if (el) pageRefs.current.set(page.id, el)
                else pageRefs.current.delete(page.id)
              }}
              data-page-id={page.id}
              className="page-canvas-slot"
            >
              <div className="page-number-label">Página {i + 1}</div>
              <PageView
                page={page}
                entry={entry}
                containerWidth={containerWidth}
                zoom={zoom}
                tool={tool}
                strokeColor={strokeColor}
                fontSize={fontSize}
                isActive={currentPageId === page.id}
                onActivate={() => setActivePage(page.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
