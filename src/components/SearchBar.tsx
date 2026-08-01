import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../state/useEditorStore'

const DEBOUNCE_MS = 300

export function SearchBar() {
  const runSearch = useEditorStore((s) => s.runSearch)
  const nextSearchResult = useEditorStore((s) => s.nextSearchResult)
  const prevSearchResult = useEditorStore((s) => s.prevSearchResult)
  const setSearchOpen = useEditorStore((s) => s.setSearchOpen)
  const searchResults = useEditorStore((s) => s.searchResults)
  const searchActiveIndex = useEditorStore((s) => s.searchActiveIndex)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  function handleChange(value: string) {
    setText(value)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setBusy(true)
      void runSearch(value).finally(() => setBusy(false))
    }, DEBOUNCE_MS)
  }

  function close() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    setSearchOpen(false)
  }

  return (
    <div className="search-bar">
      <span className="search-icon">🔍</span>
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Buscar texto no documento…"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) prevSearchResult()
            else nextSearchResult()
          } else if (e.key === 'Escape') {
            close()
          }
        }}
      />
      <span className="search-count">
        {busy
          ? '…'
          : searchResults.length > 0
            ? `${searchActiveIndex + 1} / ${searchResults.length}`
            : text
              ? '0 resultados'
              : ''}
      </span>
      <button onClick={prevSearchResult} disabled={searchResults.length === 0} title="Resultado anterior (Shift+Enter)">
        ↑
      </button>
      <button onClick={nextSearchResult} disabled={searchResults.length === 0} title="Próximo resultado (Enter)">
        ↓
      </button>
      <button onClick={close} title="Fechar (Esc)">
        ✕
      </button>
    </div>
  )
}
