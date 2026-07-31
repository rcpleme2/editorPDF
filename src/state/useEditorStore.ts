import { create } from 'zustand'
import type { LoadedSource } from '../lib/pdfEngine'
import type { PdfDocProxy } from '../lib/pdfRender'
import type { Annotation, PageState, ToolId, RGB } from '../types'

export interface SourceEntry {
  source: LoadedSource
  renderDoc: PdfDocProxy
}

const MAX_HISTORY = 10

function pushPast(past: PageState[][], snapshot: PageState[]): PageState[][] {
  const next = [...past, snapshot]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

interface EditorState {
  sources: SourceEntry[]
  pages: PageState[]
  currentPageId: string | null
  tool: ToolId
  selectedAnnotationId: string | null
  strokeColor: RGB
  fontSize: number
  clipboard: Annotation | null
  // Current stamp configuration — not persisted across sessions, just held
  // in memory so the same stamp can be placed repeatedly without retyping.
  stampText: string
  stampBold: boolean
  stampFilled: boolean
  past: PageState[][]
  // Bumped on every explicit "jump to this page" request (e.g. a sidebar
  // click), separately from currentPageId so the continuous scroll view can
  // tell an intentional navigation apart from currentPageId merely following
  // the user's own scrolling — the latter must not trigger a re-scroll.
  navigateToken: number
  navigateTargetId: string | null

  addSource: (entry: SourceEntry, pages: PageState[]) => void
  reset: () => void
  undo: () => void
  commitHistory: () => void
  setTool: (tool: ToolId) => void
  setCurrentPage: (id: string) => void
  setActivePage: (id: string) => void
  goToPage: (id: string) => void
  setSelectedAnnotation: (id: string | null) => void
  setStrokeColor: (c: RGB) => void
  setFontSize: (n: number) => void
  setStampText: (text: string) => void
  setStampBold: (bold: boolean) => void
  setStampFilled: (filled: boolean) => void
  copySelectedAnnotation: () => void
  pasteAnnotation: () => void
  duplicateSelectedAnnotation: () => void

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
  clipboard: null,
  stampText: 'APROVADO',
  stampBold: true,
  stampFilled: false,
  past: [],
  navigateToken: 0,
  navigateTargetId: null,

  addSource: (entry, newPages) =>
    set((s) => {
      const pages = [...s.pages, ...newPages]
      return {
        sources: [...s.sources, entry],
        pages,
        currentPageId: s.currentPageId ?? pages[0]?.id ?? null,
        // Only record history when importing into an already-open document —
        // the very first upload shouldn't leave an undo step that empties it.
        past: s.pages.length > 0 ? pushPast(s.past, s.pages) : s.past,
      }
    }),

  reset: () => set({ sources: [], pages: [], currentPageId: null, selectedAnnotationId: null, past: [] }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s
      const previous = s.past[s.past.length - 1]
      const past = s.past.slice(0, -1)
      const currentPageId =
        previous.find((p) => p.id === s.currentPageId)?.id ?? previous[0]?.id ?? null
      return { pages: previous, past, currentPageId, selectedAnnotationId: null }
    }),

  commitHistory: () => set((s) => ({ past: pushPast(s.past, s.pages) })),

  setTool: (tool) => set({ tool, selectedAnnotationId: null }),
  setCurrentPage: (id) => set({ currentPageId: id, selectedAnnotationId: null }),
  // Used when the scroll position (or a click within a page) reveals which
  // page is "active" — unlike setCurrentPage, it doesn't clear the current
  // selection/tool, since that would be surprising during passive scrolling.
  setActivePage: (id) =>
    set((s) => (s.currentPageId === id ? s : { currentPageId: id })),
  // Explicit "jump to this page" (sidebar click): updates the active page
  // and asks the continuous scroll view to scroll it into view.
  goToPage: (id) =>
    set((s) => ({
      currentPageId: id,
      selectedAnnotationId: null,
      navigateTargetId: id,
      navigateToken: s.navigateToken + 1,
    })),
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
  setStrokeColor: (c) => set({ strokeColor: c }),
  setFontSize: (n) => set({ fontSize: n }),
  setStampText: (text) => set({ stampText: text }),
  setStampBold: (bold) => set({ stampBold: bold }),
  setStampFilled: (filled) => set({ stampFilled: filled }),

  reorderPages: (fromIndex, toIndex) =>
    set((s) => {
      const pages = [...s.pages]
      const [moved] = pages.splice(fromIndex, 1)
      pages.splice(toIndex, 0, moved)
      return { pages, past: pushPast(s.past, s.pages) }
    }),

  deletePage: (id) =>
    set((s) => {
      const pages = s.pages.filter((p) => p.id !== id)
      const currentPageId =
        s.currentPageId === id ? pages[0]?.id ?? null : s.currentPageId
      return { pages, currentPageId, past: pushPast(s.past, s.pages) }
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
      return { pages, past: pushPast(s.past, s.pages) }
    }),

  rotatePage: (id, delta) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id
          ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 as PageState['rotation'] }
          : p,
      ),
      past: pushPast(s.past, s.pages),
    })),

  setCropBox: (id, box) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, cropBox: box } : p)),
      past: pushPast(s.past, s.pages),
    })),

  addAnnotation: (pageId, ann) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, annotations: [...p.annotations, ann] } : p,
      ),
      selectedAnnotationId: ann.id,
      past: pushPast(s.past, s.pages),
    })),

  // Note: intentionally does not push history — called continuously during
  // drag/resize (pointermove) and while typing. Callers snapshot via
  // commitHistory() once at the start of the interaction instead.
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
      past: pushPast(s.past, s.pages),
    })),

  copySelectedAnnotation: () => {
    const s = get()
    const page = s.pages.find((p) => p.id === s.currentPageId)
    const ann = page?.annotations.find((a) => a.id === s.selectedAnnotationId)
    if (ann) set({ clipboard: ann })
  },

  pasteAnnotation: () => {
    const s = get()
    const src = s.clipboard
    const pageId = s.currentPageId
    if (!src || !pageId) return
    const offset = 16
    const copy: Annotation = {
      ...src,
      id: crypto.randomUUID(),
      x: src.x + offset,
      y: src.y - offset,
      ...(src.type === 'line' || src.type === 'arrow'
        ? { x2: src.x2 + offset, y2: src.y2 - offset }
        : {}),
      ...(src.type === 'freehand'
        ? { points: src.points.map((p) => ({ x: p.x + offset, y: p.y - offset })) }
        : {}),
    } as Annotation
    set((state) => ({
      pages: state.pages.map((p) =>
        p.id === pageId ? { ...p, annotations: [...p.annotations, copy] } : p,
      ),
      selectedAnnotationId: copy.id,
      clipboard: copy,
    }))
  },

  duplicateSelectedAnnotation: () => {
    get().copySelectedAnnotation()
    get().pasteAnnotation()
  },
}))
