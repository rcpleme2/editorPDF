import { create } from 'zustand'
import type { LoadedSource } from '../lib/pdfEngine'
import type { PdfDocProxy } from '../lib/pdfRender'
import type { Annotation, PageState, ToolId, RGB } from '../types'

export interface SourceEntry {
  source: LoadedSource
  renderDoc: PdfDocProxy
}

interface EditorState {
  sources: SourceEntry[]
  pages: PageState[]
  currentPageId: string | null
  tool: ToolId
  selectedAnnotationId: string | null
  strokeColor: RGB
  fontSize: number

  addSource: (entry: SourceEntry, pages: PageState[]) => void
  reset: () => void
  setTool: (tool: ToolId) => void
  setCurrentPage: (id: string) => void
  setSelectedAnnotation: (id: string | null) => void
  setStrokeColor: (c: RGB) => void
  setFontSize: (n: number) => void

  reorderPages: (fromIndex: number, toIndex: number) => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  rotatePage: (id: string, delta: 90 | -90) => void
  setCropBox: (id: string, box: { x: number; y: number; width: number; height: number } | null) => void

  addAnnotation: (pageId: string, ann: Annotation) => void
  updateAnnotation: (pageId: string, annId: string, patch: Partial<Annotation>) => void
  removeAnnotation: (pageId: string, annId: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  sources: [],
  pages: [],
  currentPageId: null,
  tool: 'select',
  selectedAnnotationId: null,
  strokeColor: { r: 229, g: 57, b: 53 },
  fontSize: 16,

  addSource: (entry, newPages) =>
    set((s) => {
      const pages = [...s.pages, ...newPages]
      return {
        sources: [...s.sources, entry],
        pages,
        currentPageId: s.currentPageId ?? pages[0]?.id ?? null,
      }
    }),

  reset: () => set({ sources: [], pages: [], currentPageId: null, selectedAnnotationId: null }),

  setTool: (tool) => set({ tool, selectedAnnotationId: null }),
  setCurrentPage: (id) => set({ currentPageId: id, selectedAnnotationId: null }),
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
  setStrokeColor: (c) => set({ strokeColor: c }),
  setFontSize: (n) => set({ fontSize: n }),

  reorderPages: (fromIndex, toIndex) =>
    set((s) => {
      const pages = [...s.pages]
      const [moved] = pages.splice(fromIndex, 1)
      pages.splice(toIndex, 0, moved)
      return { pages }
    }),

  deletePage: (id) =>
    set((s) => {
      const pages = s.pages.filter((p) => p.id !== id)
      const currentPageId =
        s.currentPageId === id ? pages[0]?.id ?? null : s.currentPageId
      return { pages, currentPageId }
    }),

  duplicatePage: (id) =>
    set((s) => {
      const idx = s.pages.findIndex((p) => p.id === id)
      if (idx === -1) return s
      const copy: PageState = {
        ...s.pages[idx],
        id: crypto.randomUUID(),
        annotations: s.pages[idx].annotations.map((a) => ({ ...a, id: crypto.randomUUID() })),
      }
      const pages = [...s.pages]
      pages.splice(idx + 1, 0, copy)
      return { pages }
    }),

  rotatePage: (id, delta) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id
          ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 as PageState['rotation'] }
          : p,
      ),
    })),

  setCropBox: (id, box) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, cropBox: box } : p)),
    })),

  addAnnotation: (pageId, ann) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, annotations: [...p.annotations, ann] } : p,
      ),
      selectedAnnotationId: ann.id,
    })),

  updateAnnotation: (pageId, annId, patch) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              annotations: p.annotations.map((a) =>
                a.id === annId ? ({ ...a, ...patch } as Annotation) : a,
              ),
            }
          : p,
      ),
    })),

  removeAnnotation: (pageId, annId) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId
          ? { ...p, annotations: p.annotations.filter((a) => a.id !== annId) }
          : p,
      ),
      selectedAnnotationId: get().selectedAnnotationId === annId ? null : get().selectedAnnotationId,
    })),
}))
