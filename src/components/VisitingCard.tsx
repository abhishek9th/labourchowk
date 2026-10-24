import { QRCodeSVG } from 'qrcode.react'
import { useT } from '@/i18n'
import { QR_LEVEL } from '@/components/Qr'

/**
 * Standard 90 x 55 mm visiting card. `.print-card` (index.css) hides everything else when printing
 * and sets the page size, so only this card is printed. The QR keeps a white quiet zone of 4 modules.
 */
export function VisitingCard({ name, profession, url, phone }: { name: string; profession: string; url: string; phone?: string | null }) {
  const t = useT()
  return (
    <div className="print-card" aria-label={t('passport.card.label')}>
      <div className="print-card__bar">
        <span className="print-card__brand">Labour <b>Chowk</b></span>
      </div>
      <div className="print-card__body">
        <div className="print-card__text">
          <p className="print-card__name">{name}</p>
          <p className="print-card__prof">{profession}</p>
          <p className="print-card__scan">{t('passport.card.scan')}</p>
          {phone && <p className="print-card__phone">{phone}</p>}
          <p className="print-card__url">{url.replace(/^https?:\/\//, '')}</p>
        </div>
        <div className="print-card__qr">
          <QRCodeSVG value={url} level={QR_LEVEL} marginSize={4} bgColor="#ffffff" fgColor="#000000" style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  )
}
