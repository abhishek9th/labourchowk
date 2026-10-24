import { forwardRef } from 'react'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'

/** Error-correction level M (15%): robust for print/scan while keeping the code small. */
export const QR_LEVEL = 'M' as const

/**
 * The QR encodes ONLY the canonical profile URL. It is generated on demand and is therefore
 * identical for the same public id and base URL, whatever else changes in the profile.
 */
export function QrCode({ value, size = 192, label }: { value: string; size?: number; label: string }) {
  return (
    <div className="inline-block bg-white p-3" role="img" aria-label={label}>
      <QRCodeSVG value={value} size={size} level={QR_LEVEL} marginSize={0} bgColor="#ffffff" fgColor="#000000" />
    </div>
  )
}

/** Off-screen high-resolution canvas used for the PNG download (includes the 4-module quiet zone). */
export const QrPngCanvas = forwardRef<HTMLCanvasElement, { value: string; size?: number }>(function QrPngCanvas({ value, size = 1024 }, ref) {
  return (
    <div aria-hidden style={{ position: 'absolute', left: -99999, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
      <QRCodeCanvas ref={ref} value={value} size={size} level={QR_LEVEL} marginSize={4} bgColor="#ffffff" fgColor="#000000" />
    </div>
  )
})

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('ERR_QR_EXPORT'))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      resolve()
    }, 'image/png')
  })
}
