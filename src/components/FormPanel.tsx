import { useMemo } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { describeFormFields } from '../lib/pdfForms'
import type { FormFieldValue } from '../types'

export function FormPanel() {
  const sources = useEditorStore((s) => s.sources)
  const formValues = useEditorStore((s) => s.formValues)
  const setFormValue = useEditorStore((s) => s.setFormValue)
  const setFormPanelOpen = useEditorStore((s) => s.setFormPanelOpen)

  const sections = useMemo(
    () =>
      sources
        .map((entry, sourceDocIndex) => ({
          sourceDocIndex,
          name: entry.source.name,
          fields: describeFormFields(entry.source.doc),
        }))
        .filter((s) => s.fields.length > 0),
    [sources],
  )

  return (
    <aside className="form-panel">
      <div className="form-panel-header">
        <h3>Formulário</h3>
        <button onClick={() => setFormPanelOpen(false)} title="Fechar">✕</button>
      </div>
      <div className="form-panel-body">
        {sections.length === 0 && (
          <p className="form-panel-empty">Nenhum campo de formulário encontrado neste documento.</p>
        )}
        {sections.map((section) => (
          <div key={section.sourceDocIndex} className="form-section">
            <div className="form-section-title">{section.name}</div>
            {section.fields.map((f) => {
              const current: FormFieldValue = formValues[section.sourceDocIndex]?.[f.name] ?? f.defaultValue
              return (
                <div key={f.name} className="form-field-row">
                  <label className="form-field-label" title={f.name}>
                    {f.name}
                  </label>
                  {f.type === 'text' && (
                    <input
                      type="text"
                      value={current as string}
                      onChange={(e) => setFormValue(section.sourceDocIndex, f.name, e.target.value)}
                    />
                  )}
                  {f.type === 'checkbox' && (
                    <input
                      type="checkbox"
                      checked={current as boolean}
                      onChange={(e) => setFormValue(section.sourceDocIndex, f.name, e.target.checked)}
                    />
                  )}
                  {(f.type === 'radio' || f.type === 'dropdown') && (
                    <select
                      value={current as string}
                      onChange={(e) => setFormValue(section.sourceDocIndex, f.name, e.target.value)}
                    >
                      <option value="">—</option>
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.type === 'optionlist' && (
                    <select
                      multiple={f.multiselect}
                      value={current as string[]}
                      onChange={(e) =>
                        setFormValue(
                          section.sourceDocIndex,
                          f.name,
                          Array.from(e.target.selectedOptions).map((o) => o.value),
                        )
                      }
                    >
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.type === 'unsupported' && <span className="form-field-unsupported">Não suportado</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
