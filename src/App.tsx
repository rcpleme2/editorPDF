import { useEffect } from 'react'
import { useEditorStore } from './state/useEditorStore'
import { Toolbar } from './components/Toolbar'
import { Dropzone } from './components/Dropzone'
import { ThumbnailSidebar } from './components/ThumbnailSidebar'
import { PageCanvas } from './components/PageCanvas'
import { SearchBar } from './components/SearchBar'
import { FormPanel } from './components/FormPanel'
import './App.css'

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function App() {
  const hasDoc = useEditorStore((s) => s.pages.length > 0)
  const searchOpen = useEditorStore((s) => s.searchOpen)
  const formPanelOpen = useEditorStore((s) => s.formPanelOpen)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      const isMod = e.ctrlKey || e.metaKey
      const store = useEditorStore.getState()

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
      } else if (isMod && e.key.toLowerCase() === 'f') {
        if (store.pages.length > 0) {
          e.preventDefault()
          store.setSearchOpen(true)
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedAnnotationId && store.currentPageId) {
          e.preventDefault()
          store.removeAnnotation(store.currentPageId, store.selectedAnnotationId)
        }
      } else if (!store.selectedAnnotationId && (e.key === 'ArrowDown' || e.key === 'PageDown')) {
        e.preventDefault()
        store.goToRelativePage(1)
      } else if (!store.selectedAnnotationId && (e.key === 'ArrowUp' || e.key === 'PageUp')) {
        e.preventDefault()
        store.goToRelativePage(-1)
      } else if (e.key === 'Escape' && store.searchOpen) {
        store.setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app-shell">
      <Toolbar />
      {searchOpen && <SearchBar />}
      <div className="app-body">
        {hasDoc ? (
          <>
            <ThumbnailSidebar />
            <main className="app-main">
              <PageCanvas />
            </main>
            {formPanelOpen && <FormPanel />}
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
