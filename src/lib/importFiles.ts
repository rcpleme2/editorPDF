import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { loadSourcePdf, makeInitialPages, type LoadedSource } from './pdfEngine'
import { loadPdfDocument, type PdfDocProxy } from './pdfRender'
import type { PageState } from '../types'

const PAGE_WIDTH = 595.28 // A4 pt
const PAGE_HEIGHT = 841.89
const MARGIN = 50

function extOf(file: File) {
  return file.name.toLowerCase().split('.').pop() ?? ''
}

async function imageFileToPdfBytes(file: File): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer()
  const doc = await PDFDocument.create()
  const isPng = file.type === 'image/png' || extOf(file) === 'png'
  const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)

  const maxDim = 1000
  let { width, height } = image
  if (width > maxDim || height > maxDim) {
    const s = maxDim / Math.max(width, height)
    width *= s
    height *= s
  }

  const page = doc.addPage([width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })
  return doc.save()
}

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

async function textToPdfBytes(lines: string[], opts?: { fontSize?: number; landscape?: boolean }): Promise<Uint8Array> {
  const fontSize = opts?.fontSize ?? 11
  const pageWidth = opts?.landscape ? PAGE_HEIGHT : PAGE_WIDTH
  const pageHeight = opts?.landscape ? PAGE_WIDTH : PAGE_HEIGHT
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const lineHeight = fontSize * 1.4
  const usableWidth = pageWidth - MARGIN * 2
  const linesPerPage = Math.floor((pageHeight - MARGIN * 2) / lineHeight)

  const wrapped = lines.flatMap((l) => wrapText(l, font, fontSize, usableWidth))
  const finalLines = wrapped.length > 0 ? wrapped : ['']

  for (let i = 0; i < finalLines.length; i += linesPerPage) {
    const chunk = finalLines.slice(i, i + linesPerPage)
    const page = doc.addPage([pageWidth, pageHeight])
    chunk.forEach((line, idx) => {
      page.drawText(line, {
        x: MARGIN,
        y: pageHeight - MARGIN - lineHeight * (idx + 1),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
    })
  }
  return doc.save()
}

async function docxFileToPdfBytes(file: File): Promise<Uint8Array> {
  const mammoth = await import('mammoth/mammoth.browser.js')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return textToPdfBytes(result.value.split('\n'))
}

async function xlsxFileToPdfBytes(file: File): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const lines: string[] = []
  for (const sheetName of workbook.SheetNames) {
    lines.push(`=== ${sheetName} ===`)
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    lines.push(...csv.split('\n'))
    lines.push('')
  }
  return textToPdfBytes(lines, { fontSize: 9, landscape: true })
}

export interface ImportedPagesResult {
  source: LoadedSource
  renderDoc: PdfDocProxy
  pages: PageState[]
}

export async function importFileAsPages(file: File, sourceDocIndex: number): Promise<ImportedPagesResult> {
  const ext = extOf(file)
  let bytes: ArrayBuffer

  if (ext === 'pdf' || file.type === 'application/pdf') {
    bytes = await file.arrayBuffer()
  } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || file.type.startsWith('image/')) {
    bytes = (await imageFileToPdfBytes(file)).slice().buffer as ArrayBuffer
  } else if (ext === 'docx') {
    bytes = (await docxFileToPdfBytes(file)).slice().buffer as ArrayBuffer
  } else if (ext === 'xlsx' || ext === 'xls') {
    bytes = (await xlsxFileToPdfBytes(file)).slice().buffer as ArrayBuffer
  } else {
    throw new Error(`"${file.name}": formato não suportado. Use PDF, imagem (PNG/JPG), Word (.docx) ou Excel (.xlsx).`)
  }

  const source = await loadSourcePdf(file.name, bytes.slice(0))
  const renderDoc = await loadPdfDocument(bytes.slice(0))
  const pages = makeInitialPages(sourceDocIndex, source.doc)
  return { source, renderDoc, pages }
}
