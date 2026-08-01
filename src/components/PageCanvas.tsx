import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { PageView } from './PageView'
import { computePageScale } from '../lib/pageScale'
import type { SearchMatch } from '../types'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1
const INITIAL_RENDER_COUNT = 3
const PRELOAD_MARGIN = '1000px 0px'
// Shrinks the observed root down to a thin horizontal band positioned just
// below the sticky zoom-controls bar. Whichever page slot crosses that band
// is "the" active page — a single, unambiguous target line, unlike
// comparing intersection ratios (which breaks down when every page is
// taller than the viewport, since the page nearest the top and the one
// below it can end up with very similar visible-area ratios).
const ACTIVE_LINE_MARGIN = '-20% 0px -70% 0px'

export function PageCanvas() {
  const pages = useEditorStore((s) => s.pages)
  const sources = useEditorStore((s) => s.sources)
  const currentPageId = useEditorStore((s) => s.currentPageId)
  const navigateToken = useEditorStore((s) => s.navigateToken)
  const navigateTargetId = useEditorStore((s) => s.navigateTargetId)
  const tool = useEditorStore((s) => s.tool)
  const strokeColor = useEditorStore((s) => s.strokeColor)
  const fontSize = useEditorStore((s) => s.fontSize)
  const stampText = useEditorStore((s) => s.stampText)
  const stampBold = useEditorStore((s) => s.stampBold)
  const stampFilled = useEditorStore((s) => s.stampFilled)
  const setActivePage = useEditorStore((s) => s.setActivePage)
  const searchResults = useEditorStore((s) => s.searchResults)
  const searchActiveIndex = useEditorStore((s) => s.searchActiveIndex)

  const outerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<string, HTMLDivElement>())
  const [containerWidth, setContainerWidth] = useState(800)
  const [zoom, setZoom] = useState(1)
  // Pages that get their real content mounted (viewport render + tool
  // interaction). Grows as the user scrolls near a page; never shrinks, to
  // avoid remount/refetch flicker for pages briefly scrolled past.
  const [renderSet, setRenderSet] = useState<Set<string>>(
    () => new Set(pages.slice(0, INITIAL_RENDER_COUNT).map((p) => p.id)),
  )

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

  // Which pages are close enough to the viewport (via a large preload
  // rootMargin) that they should be fully rendered — pages far away stay as
  // lightweight placeholders so huge PDFs don't render every page's canvas
  // up front.
  useEffect(() => {
    const scrollRoot = outerRef.current?.closest('.app-main')
    if (!scrollRoot) return
    const observer = new IntersectionObserver(
      (entries) => {
        const newlyNear = entries
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).dataset.pageId)
          .filter((id): id is string => !!id)
        if (newlyNear.length === 0) return
        setRenderSet((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const id of newlyNear) {
            if (!next.has(id)) {
              next.add(id)
              changed = true
            }
          }
          return changed ? next : prev
        })
      },
      { root: scrollRoot, rootMargin: PRELOAD_MARGIN, threshold: 0 },
    )
    for (const el of pageRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [pages])

  // Which page is "active" (sidebar highlight, crop hint bar): whichever
  // page slot crosses a thin detection line near the top of the viewport.
  useEffect(() => {
    const scrollRoot = outerRef.current?.closest('.app-main')
    if (!scrollRoot) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const id = (entry.target as HTMLElement).dataset.pageId
          if (id) {
            setActivePage(id)
            break
          }
        }
      },
      { root: scrollRoot, rootMargin: ACTIVE_LINE_MARGIN, threshold: 0 },
    )
    for (const el of pageRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [pages, setActivePage])

  // Explicit "jump to this page" request (sidebar click, search result,
  // arrow-key navigation) — force-render it immediately (don't wait for the
  // preload margin to catch up) and scroll it into view. Driven by
  // navigateToken (not currentPageId) so that currentPageId simply
  // following the user's own scroll never triggers a re-scroll.
  useEffect(() => {
    if (navigateToken === 0 || !navigateTargetId) return
    setRenderSet((prev) => (prev.has(navigateTargetId) ? prev : new Set(prev).add(navigateTargetId)))
    const el = pageRefs.current.get(navigateTargetId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateToken])

  const matchesByPage = useMemo(() => {
    const map = new Map<string, SearchMatch[]>()
    for (const m of searchResults) {
      const list = map.get(m.pageId)
      if (list) list.push(m)
      else map.set(m.pageId, [m])
    }
    return map
  }, [searchResults])
  const activeMatch = searchActiveIndex >= 0 ? searchResults[searchActiveIndex] : null

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
          const shouldRender = renderSet.has(page.id)
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
              {shouldRender ? (
                <PageView
                  page={page}
                  entry={entry}
                  containerWidth={containerWidth}
                  zoom={zoom}
                  tool={tool}
                  strokeColor={strokeColor}
                  fontSize={fontSize}
                  stampText={stampText}
                  stampBold={stampBold}
                  stampFilled={stampFilled}
                  isActive={currentPageId === page.id}
                  onActivate={() => setActivePage(page.id)}
                  matches={matchesByPage.get(page.id) ?? EMPTY_MATCHES}
                  activeMatchItemIndex={activeMatch?.pageId === page.id ? activeMatch.itemIndex : null}
                />
              ) : (
                <PagePlaceholder page={page} containerWidth={containerWidth} zoom={zoom} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const EMPTY_MATCHES: SearchMatch[] = []

function PagePlaceholder({
  page,
  containerWidth,
  zoom,
}: {
  page: { width: number; height: number; rotation: number }
  containerWidth: number
  zoom: number
}) {
  const { scale, displayW, displayH } = computePageScale(page, containerWidth, zoom)
  return <div className="page-canvas-placeholder" style={{ width: displayW * scale, height: displayH * scale }} />
}
