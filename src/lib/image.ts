// Client-side photo validation and downscaling (low-end phones upload multi-MB camera photos).
// The storage bucket enforces type and size again on the server; this gives instant feedback.

export const MAX_INPUT_BYTES = 20 * 1024 * 1024   // raw file we are willing to read
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024   // what the bucket accepts
export const MAX_DIMENSION = 1600

export type ImageKind = 'jpeg' | 'png' | 'webp'

/** Identify the real image type from the file's first bytes (the extension/MIME can lie). */
export function sniffImageType(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

export type ImageProblem = 'empty' | 'tooLarge' | 'notImage' | 'unsupported'

export function checkFileBasics(size: number, bytes: Uint8Array): ImageProblem | null {
  if (size === 0) return 'empty'
  if (size > MAX_INPUT_BYTES) return 'tooLarge'
  return sniffImageType(bytes) ? null : 'notImage'
}

/** Target size keeping aspect ratio, never upscaling. */
export function fitWithin(w: number, h: number, max = MAX_DIMENSION): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

export interface PreparedImage { blob: Blob; ext: 'jpg'; width: number; height: number }

/**
 * Validate by content, decode, downscale and re-encode as JPEG. Re-encoding also strips EXIF (so a
 * photo's GPS position is never published). Throws Error('ERR_IMAGE_<problem>').
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const problem = checkFileBasics(file.size, head)
  if (problem) throw new Error(`ERR_IMAGE_${problem.toUpperCase()}`)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('ERR_IMAGE_UNSUPPORTED')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ERR_IMAGE_UNSUPPORTED')
  ctx.fillStyle = '#ffffff'            // flatten transparency
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return { blob, ext: 'jpg', width, height }
  }
  throw new Error('ERR_IMAGE_TOOLARGE')
}
