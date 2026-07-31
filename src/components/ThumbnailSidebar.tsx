import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditorStore } from '../state/useEditorStore'
import { renderPageToDataUrl } from '../lib/pdfRender'
import type { PageState } from '../types'

function Thumbnail({ page, index }: { page: PageState; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  })
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const sources = useEditorStore((s) => s.sources)
  const currentPageId = useEditorStore((s) => s.currentPageId)
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage)
  const deletePage = useEditorStore((s) => s.deletePage)
  const duplicatePage = useEditorStore((s) => s.duplicatePage)
  const rotatePage = useEditorStore((s) => s.rotatePage)

  useEffect(() => {
    let cancelled = false
    const entry = sources[page.sourceDocIndex]
    if (!entry) return
    renderPageToDataUrl(entry.renderDoc, page.sourcePageIndex, 0.25, page.rotation).then((res) => {
      if (!cancelled) setDataUrl(res.dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [sources, page.sourceDocIndex, page.sourcePageIndex, page.rotation])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`thumb ${currentPageId === page.id ? 'active' : ''}`}
      onClick={() => setCurrentPage(page.id)}
    >
      <div className="thumb-drag-handle" {...attributes} {...listeners}>
        ⠿
      </div>
      <div className="thumb-img-wrap">
        {dataUrl ? <img src={dataUrl} alt={`Página ${index + 1}`} /> : <div className="thumb-placeholder" />}
      </div>
      <div className="thumb-label">{index + 1}</div>
      <div className="thumb-actions">
        <button title="Rotacionar" onClick={(e) => { e.stopPropagation(); rotatePage(page.id, 90) }}>⟳</button>
        <button title="Duplicar" onClick={(e) => { e.stopPropagation(); duplicatePage(page.id) }}>⧉</button>
        <button title="Excluir" onClick={(e) => { e.stopPropagation(); deletePage(page.id) }}>✕</button>
      </div>
    </div>
  )
}

export function ThumbnailSidebar() {
  const pages = useEditorStore((s) => s.pages)
  const reorderPages = useEditorStore((s) => s.reorderPages)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pages.findIndex((p) => p.id === active.id)
    const newIndex = pages.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderPages(oldIndex, newIndex)
  }

  if (pages.length === 0) return null

  return (
    <aside className="thumbnail-sidebar">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="thumb-list">
            {pages.map((page, i) => (
              <Thumbnail key={page.id} page={page} index={i} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  )
}
