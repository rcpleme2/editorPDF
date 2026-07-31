import { useEffect } from 'react'
import { useEditorStore } from './state/useEditorStore'
import { Toolbar } from './components/Toolbar'
import { Dropzone } from './components/Dropzone'
import { ThumbnailSidebar } from './components/ThumbnailSidebar'
import { PageCanvas } from './components/PageCanvas'
import './App.css'

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function App() {
  const hasDoc = useEditorStore((s) => s.pages.length > 0)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      const isMod = e.ctrlKey || e.metaKey
      const store = useEditorStore.getState()
      if (!store.selectedAnnotationId && !isMod) return

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        store.undo()
      } else if (isMod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        store.copySelectedAnnotation()
      } else if (isMod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        store.pasteAnnotation()
      } else if (isMod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        store.duplicateSelectedAnnotation()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedAnnotationId && store.currentPageId) {
          e.preventDefault()
          store.removeAnnotation(store.currentPageId, store.selectedAnnotationId)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="app-body">
        {hasDoc ? (
          <>
            <ThumbnailSidebar />
            <main className="app-main">
              <PageCanvas />
            </main>
          </>
        ) : (
          <main className="app-main app-main-empty">
            <Dropzone />
          </main>
        )}
      </div>
    </div>
  )
}

export default App
