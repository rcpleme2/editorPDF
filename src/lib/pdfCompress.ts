import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'

export interface CompressOptions {
  /** JPEG re-encode quality, 0..1 */
  quality: number
  /** Downsample images whose longest side (in px) exceeds this */
  maxDimension: number
}

export const DEFAULT_COMPRESS_OPTIONS: CompressOptions = { quality: 0.72, maxDimension: 1600 }

async function recompressJpeg(
  bytes: Uint8Array,
  maxDimension: number,
  quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  try {
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/jpeg' })
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const newW = Math.max(1, Math.round(bitmap.width * scale))
    const newH = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = newW
    canvas.height = newH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, newW, newH)
    bitmap.close()
    const newBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!newBlob) return null
    const newBytes = new Uint8Array(await newBlob.arrayBuffer())
    return { bytes: newBytes, width: newW, height: newH }
  } catch {
    return null
  }
}

/** Recompresses embedded JPEG images in place (mutating `doc`) to reduce
 * file size: downsamples anything larger than `maxDimension` and re-encodes
 * at the given JPEG quality.
 *
 * Deliberately conservative — only touches image XObjects that use a single
 * DCTDecode (JPEG) filter and a non-CMYK color space (decoding a CMYK JPEG
 * through a <canvas> can invert its colors, since canvas assumes
 * YCbCr/RGB), and only keeps a recompressed image if it actually came out
 * smaller. Other image encodings (PNG-style FlateDecode, JPEG2000, CCITT
 * fax scans, indexed/CMYK color) are left untouched rather than risking a
 * corrupted or discolored image. */
export async function compressPdfImages(
  doc: PDFDocument,
  options: CompressOptions = DEFAULT_COMPRESS_OPTIONS,
): Promise<{ imagesProcessed: number; bytesSaved: number }> {
  let imagesProcessed = 0
  let bytesSaved = 0

  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const dict = obj.dict
    const subtype = dict.get(PDFName.of('Subtype'))
    if (!subtype || subtype.toString() !== '/Image') continue

    const filter = dict.get(PDFName.of('Filter'))
    if (!filter || filter instanceof PDFArray || filter.toString() !== '/DCTDecode') continue

    const colorSpace = dict.get(PDFName.of('ColorSpace'))
    if (colorSpace && colorSpace.toString() === '/DeviceCMYK') continue

    const originalBytes = obj.contents
    const result = await recompressJpeg(originalBytes, options.maxDimension, options.quality)
    if (!result || result.bytes.length >= originalBytes.length) continue

    // `contents` is typed readonly (it's a public-API safety marker), but
    // pdf-lib's PDFRawStream constructor just assigns it as a plain field —
    // mutating it in place is how pdf-lib itself expects streams to be
    // edited post-construction.
    ;(obj as { contents: Uint8Array }).contents = result.bytes
    dict.set(PDFName.of('Width'), PDFNumber.of(result.width))
    dict.set(PDFName.of('Height'), PDFNumber.of(result.height))
    dict.set(PDFName.of('Length'), PDFNumber.of(result.bytes.length))
    imagesProcessed++
    bytesSaved += originalBytes.length - result.bytes.length
  }

  return { imagesProcessed, bytesSaved }
}
