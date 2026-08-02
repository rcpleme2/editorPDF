export type ToolId =
  | 'select'
  | 'text'
  | 'highlight'
  | 'draw'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'note'
  | 'stamp'
  | 'crop'

export type RGB = { r: number; g: number; b: number }

interface AnnotationBase {
  id: string
  pageIndex: number
  /**
   * Coordinates are stored in native PDF user space: origin bottom-left,
   * x right, y up, in the page's own (unrotated) point system — exactly
   * what pdf-lib's draw* methods expect. x/y is the bottom-left corner.
   */
  x: number
  y: number
  width: number
  height: number
  color: RGB
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  text: string
  fontSize: number
  /** true when this text box was created to cover/replace existing PDF text */
  isReplacement: boolean
  bold: boolean
  italic: boolean
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight'
  opacity: number
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'rect' | 'circle'
  strokeWidth: number
  fill: boolean
}

interface LineAnnotationBase extends AnnotationBase {
  x2: number
  y2: number
  strokeWidth: number
}

export interface LineAnnotation extends LineAnnotationBase {
  type: 'line'
}

export interface ArrowAnnotation extends LineAnnotationBase {
  type: 'arrow'
}

export interface FreehandAnnotation extends AnnotationBase {
  type: 'freehand'
  points: { x: number; y: number }[]
  strokeWidth: number
}

export interface NoteAnnotation extends AnnotationBase {
  type: 'note'
  text: string
  open: boolean
}

export interface StampAnnotation extends AnnotationBase {
  type: 'stamp'
  text: string
  fontSize: number
  bold: boolean
  /** translucent background fill using `color`, in addition to the border */
  filled: boolean
}

export interface ParagraphAnnotation extends AnnotationBase {
  type: 'paragraph'
  text: string
  fontSize: number
  bold: boolean
  italic: boolean
  /** always true — a paragraph annotation always covers/replaces original PDF text */
  isReplacement: true
  /**
   * One representative original text run from this paragraph (text + its
   * measured width in the source PDF), kept so the same embedded font in
   * the source document can be re-resolved deterministically later (both
   * for on-screen wrapping and at export) without storing the font's raw
   * bytes in app state/undo history.
   */
  sampleOriginalText: string
  sampleOriginalWidth: number
}

export type Annotation =
  | TextAnnotation
  | HighlightAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | ArrowAnnotation
  | FreehandAnnotation
  | NoteAnnotation
  | StampAnnotation
  | ParagraphAnnotation

export interface PageState {
  id: string
  /** index of the page inside its source document at load time (for re-extraction) */
  sourceDocIndex: number
  sourcePageIndex: number
  rotation: 0 | 90 | 180 | 270
  /** PDF point-space crop box, or null for no crop */
  cropBox: { x: number; y: number; width: number; height: number } | null
  /** original, un-rotated page size in points */
  width: number
  height: number
  annotations: Annotation[]
}

export interface TextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontName: string
}

export interface SearchMatch {
  pageId: string
  itemIndex: number
  item: TextItem
}

export type FormFieldValue = string | boolean | string[]
