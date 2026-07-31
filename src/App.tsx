import { useEditorStore } from './state/useEditorStore'
import { Toolbar } from './components/Toolbar'
import { Dropzone } from './components/Dropzone'
import { ThumbnailSidebar } from './components/ThumbnailSidebar'
import { PageCanvas } from './components/PageCanvas'
import './App.css'

function App() {
  const hasDoc = useEditorStore((s) => s.pages.length > 0)

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
