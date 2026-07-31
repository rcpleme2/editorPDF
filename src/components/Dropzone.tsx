import { useCallback, useRef, useState } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { loadSourcePdf, makeInitialPages } from '../lib/pdfEngine'
import { loadPdfDocument } from '../lib/pdfRender'

export function Dropzone() {
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addSource = useEditorStore((s) => s.addSource)
  const sourcesCount = useEditorStore((s) => s.sources.length)

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setLoading(true)
      setError(null)
      try {
        for (const file of Array.from(files)) {
          if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            throw new Error(`"${file.name}" não é um PDF.`)
          }
          const bytes = await file.arrayBuffer()
          const source = await loadSourcePdf(file.name, bytes.slice(0))
          const renderDoc = await loadPdfDocument(bytes.slice(0))
          const sourceDocIndex = sourcesCount
          const pages = makeInitialPages(sourceDocIndex, source.doc)
          addSource({ source, renderDoc }, pages)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar o PDF.')
      } finally {
        setLoading(false)
      }
    },
    [addSource, sourcesCount],
  )

  return (
    <div
      className={`dropzone ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void handleFiles(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="dropzone-inner">
        <p className="dropzone-title">
          {loading ? 'Carregando PDF...' : 'Arraste um ou mais PDFs aqui'}
        </p>
        <p className="dropzone-sub">ou clique para selecionar arquivos</p>
        {error && <p className="dropzone-error">{error}</p>}
      </div>
    </div>
  )
}
