import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import sql from '@/lib/db'
import { getIdentity, unauthorized } from '@/lib/auth'
import { ipaymuConfig, checkoutAvailability } from '@/lib/ipaymu'

export const runtime = 'nodejs'

/**
 * Turn a QRIS payload string into a scannable PNG.
 *
 * WHY THIS EXISTS. iPaymu's Direct Payment response for QRIS returns the code as a STRING
 * (`QrString`, and sometimes `PaymentNo`), not as an image. The modal was written on the
 * assumption that `Url` would carry a hosted image, so when the gateway answered with only the
 * string there was no QR to show and the fallback printed the raw EMVCo payload as text — a wall
 * of `00020101021226650013ID.CO...` over the instructions. A QRIS string is exactly what a QR
 * code IS, so the fix is to encode it rather than to hope for an image.
 *
 * WHY A ROUTE AND NOT CLIENT-SIDE ENCODING. Encoding in the browser would mean shipping a QR
 * library to every visitor who never opens the checkout, and it would put the payload through the
 * client bundle. Here the payload stays server-side, the response is a small PNG, and the modal
 * only ever sees an <img src>.
 *
 * WHY THE PAYLOAD IS RE-READ FROM THE DATABASE. The route takes an ORDER ID, never the payload
 * itself. If it accepted a string it would be an open image generator: anyone could ask our server
 * to render arbitrary QR codes, and the endpoint would be usable as a free QR service under our
 * domain. Taking an order id means the payload can only be one we already stored for that buyer.
 *
 * NOT A SECRET. The QRIS payload is displayed on screen to be scanned; it is not treated as a
 * credential. The ownership check below is about not letting one account render another account's
 * invoice, not about hiding the string.
 */

/** Where the QR is cached. The payload never changes for an order, so the image is immutable. */
const CACHE_SECONDS = 300

export async function GET(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const cfg = ipaymuConfig()
  if (!cfg) return new NextResponse(null, { status: 503 })

  const url = new URL(req.url)
  const orderId = url.searchParams.get('order')
  if (!orderId || orderId.length > 64) return new NextResponse(null, { status: 400 })

  const [row] = await sql<{ QrPayload: string | null }[]>`
    SELECT COALESCE(
             "RawPayload"->'direct'->>'qrPayload',
             "RawPayload"->'direct'->>'paymentNo'
           ) AS "QrPayload"
    FROM payments
    WHERE "ProviderOrderId" = ${orderId} AND "Provider" = 'ipaymu' AND "UserId" = ${me.id}
    LIMIT 1`

  if (!row) return new NextResponse(null, { status: 404 })

  const payload = (row.QrPayload ?? '').trim()
  /* A QRIS payload always starts with the EMVCo tag `000201`. Checking it stops a VA number, or
     any other string that happens to be stored, from being rendered as a QR that cannot be paid. */
  if (!payload.startsWith('000201')) return new NextResponse(null, { status: 404 })

  /* `type: 'png'` and an explicit width: the modal renders it at 220 CSS px and the screen is the
     only consumer, so a 660px bitmap is sharp on a 3x phone screen without being large. Margin 1
     keeps the quiet zone the spec asks for without wasting the plate. */
  const png = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 660,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  })

  const availability = checkoutAvailability(cfg)
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      /* `private` because the image is scoped to one account; a shared cache must not keep it. */
      'Cache-Control': availability.available
        ? `private, max-age=${CACHE_SECONDS}, immutable`
        : 'no-store',
    },
  })
}
