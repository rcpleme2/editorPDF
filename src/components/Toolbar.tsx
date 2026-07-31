import { useRef, useState } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { exportPdf } from '../lib/pdfEngine'
import { importFileAsPages } from '../lib/importFiles'
import type { RGB, ToolId } from '../types'

const TOOLS: { id: ToolId; label: string; icon: string; hint?: string }[] = [
  { id: 'select', label: 'Selecionar', icon: '⇧' },
  { id: 'text', label: 'Texto', icon: 'T', hint: 'Clique num texto existente para editá-lo, ou em área vazia para inserir texto novo' },
  { id: 'highlight', label: 'Realce', icon: '▧' },
  { id: 'draw', label: 'Desenho', icon: '✎' },
  { id: 'rect', label: 'Retângulo', icon: '▭' },
  { id: 'circle', label: 'Círculo', icon: '◯' },
  { id: 'line', label: 'Linha', icon: '╱' },
  { id: 'arrow', label: 'Seta', icon: '➜' },
  { id: 'note', label: 'Nota', icon: '🗒' },
  { id: 'crop', label: 'Cortar página', icon: '⛶' },
]

const SWATCHES: RGB[] = [
  { r: 0, g: 0, b: 0 },
  { r: 229, g: 57, b: 53 },
  { r: 30, g: 111, b: 219 },
  { r: 46, g: 160, b: 67 },
  { r: 255, g: 179, b: 0 },
]

function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([bytes.slice().buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const strokeColor = useEditorStore((s) => s.strokeColor)
  const setStrokeColor = useEditorStore((s) => s.setStrokeColor)
  const fontSize = useEditorStore((s) => s.fontSize)
  const setFontSize = useEditorStore((s) => s.setFontSize)
  const sources = useEditorStore((s) => s.sources)
  const pages = useEditorStore((s) => s.pages)
  const reset = useEditorStore((s) => s.reset)
  const addSource = useEditorStore((s) => s.addSource)
  const undo = useEditorStore((s) => s.undo)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const [busy, setBusy] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const hasDoc = pages.length > 0

  async function handleExport() {
    setBusy('export')
    try {
      const bytes = await exportPdf(sources.map((e) => e.source), pages)
      downloadBytes(bytes, 'documento-editado.pdf', 'application/pdf')
    } finally {
      setBusy(null)
    }
  }

  function handleNewDocument() {
    if (window.confirm('Fechar o documento atual sem baixar? Alterações não salvas serão perdidas.')) {
      reset()
    }
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy('import')
    setImportError(null)
    try {
      for (const file of Array.from(files)) {
        const { source, renderDoc, pages: newPages } = await importFileAsPages(
          file,
          useEditorStore.getState().sources.length,
        )
        addSource({ source, renderDoc }, newPages)
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Falha ao importar arquivo.')
    } finally {
      setBusy(null)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar-brand">📄 EditorPDF</div>

      {hasDoc && (
        <>
          <div className="toolbar-group">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                title={t.hint ?? t.label}
                className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                onClick={() => setTool(t.id)}
              >
                <span className="tool-icon">{t.icon}</span>
                <span className="tool-label">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-group toolbar-style">
            <div className="swatches">
              {SWATCHES.map((c, i) => (
                <button
                  key={i}
                  className={`swatch ${strokeColor.r === c.r && strokeColor.g === c.g && strokeColor.b === c.b ? 'active' : ''}`}
                  style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                  onClick={() => setStrokeColor(c)}
                />
              ))}
              <input
                type="color"
                className="swatch-custom"
                value={`#${[strokeColor.r, strokeColor.g, strokeColor.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`}
                onChange={(e) => {
                  const hex = e.target.value
                  setStrokeColor({
                    r: parseInt(hex.slice(1, 3), 16),
                    g: parseInt(hex.slice(3, 5), 16),
                    b: parseInt(hex.slice(5, 7), 16),
                  })
                }}
              />
            </div>
            {tool === 'text' && (
              <label className="font-size-control">
                Tamanho
                <input
                  type="number"
                  min={6}
                  max={96}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value) || 12)}
                />
              </label>
            )}
          </div>

          <div className="toolbar-group toolbar-actions">
            <button onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
              ↺ Desfazer
            </button>
            <button onClick={() => importInputRef.current?.click()} disabled={busy !== null}>
              {busy === 'import' ? 'Importando…' : '+ Páginas'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".pdf,application/pdf,.png,.jpg,.jpeg,image/png,image/jpeg,.docx,.xlsx,.xls"
              multiple
              hidden
              onChange={(e) => void handleImportFiles(e.target.files)}
            />
            <button className="primary" onClick={handleExport} disabled={busy !== null}>
              {busy === 'export' ? 'Exportando…' : 'Baixar PDF'}
            </button>
            <button className="ghost" onClick={handleNewDocument}>Novo documento</button>
          </div>
        </>
      )}
      {importError && <p className="dropzone-error toolbar-error">{importError}</p>}
    </header>
  )
}
