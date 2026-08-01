import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib'
import type { PDFField } from 'pdf-lib'
import type { FormFieldValue } from '../types'

export interface FormFieldDescriptor {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist' | 'unsupported'
  options?: string[]
  multiselect?: boolean
  defaultValue: FormFieldValue
}

/** Lists the fillable AcroForm fields of a document, with their current
 * values, for building a fill-in UI. Returns [] for PDFs with no form. */
export function describeFormFields(doc: PDFDocument): FormFieldDescriptor[] {
  let fields: PDFField[]
  try {
    fields = doc.getForm().getFields()
  } catch {
    return []
  }
  const out: FormFieldDescriptor[] = []
  for (const field of fields) {
    let name = ''
    try {
      name = field.getName()
    } catch {
      continue
    }
    try {
      if (field instanceof PDFTextField) {
        out.push({ name, type: 'text', defaultValue: field.getText() ?? '' })
      } else if (field instanceof PDFCheckBox) {
        out.push({ name, type: 'checkbox', defaultValue: field.isChecked() })
      } else if (field instanceof PDFRadioGroup) {
        out.push({ name, type: 'radio', options: field.getOptions(), defaultValue: field.getSelected() ?? '' })
      } else if (field instanceof PDFDropdown) {
        out.push({
          name,
          type: 'dropdown',
          options: field.getOptions(),
          defaultValue: field.getSelected()[0] ?? '',
        })
      } else if (field instanceof PDFOptionList) {
        out.push({
          name,
          type: 'optionlist',
          options: field.getOptions(),
          multiselect: field.isMultiselect(),
          defaultValue: field.getSelected(),
        })
      } else {
        out.push({ name, type: 'unsupported', defaultValue: '' })
      }
    } catch {
      out.push({ name, type: 'unsupported', defaultValue: '' })
    }
  }
  return out
}

/** Writes the given field values into the document's form and flattens it
 * (bakes the values into the page content), so they show up correctly even
 * once the pages are copied into a fresh output document that never
 * inherited the original /AcroForm. Skips any field that fails to set
 * rather than aborting the whole export. */
export function applyFormValues(doc: PDFDocument, values: Record<string, FormFieldValue>) {
  const form = doc.getForm()
  for (const [name, value] of Object.entries(values)) {
    try {
      const field = form.getField(name)
      if (field instanceof PDFTextField) {
        field.setText(typeof value === 'string' ? value : String(value ?? ''))
      } else if (field instanceof PDFCheckBox) {
        if (value) field.check()
        else field.uncheck()
      } else if (field instanceof PDFRadioGroup) {
        if (typeof value === 'string' && value) field.select(value)
      } else if (field instanceof PDFDropdown) {
        field.select(typeof value === 'string' ? [value] : (value as string[]))
      } else if (field instanceof PDFOptionList) {
        field.select(Array.isArray(value) ? value : [String(value)])
      }
    } catch {
      // Skip fields that fail to set (e.g. a stale option) rather than
      // failing the whole export.
    }
  }
  try {
    form.flatten()
  } catch {
    // Leave the form interactive if flattening fails for some field.
  }
}
