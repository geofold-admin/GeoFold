import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUSINESS, LEGAL } from '@/lib/business'

/**
 * The social preview card, drawn at request time.
 *
 * WHY THIS IS NOT A STATIC FILE. A static PNG goes stale the moment the headline, the price or
 * the palette changes, and nobody notices because the only place it appears is someone else's
 * timeline. Drawing it from the same constants the site renders means it cannot disagree with the
 * page it is previewing.
 *
 * WHY 1200x630. That is the size every platform expects (Open Graph's 1.91:1). Anything else is
 * either letterboxed with bars or cropped at the edges, and the crop is what eats a wordmark.
 *
 * WHY THE FONT IS NOT LOADED FROM THE NETWORK. Fetching a webfont inside the handler would make
 * every social crawler's request depend on a third party being up, and a failure there returns a
 * broken image with no error anywhere. This uses the runtime's own default font stack, which is
 * always present, and the design is built to not need a specific face: the mark carries the
 * identity, the type is set large and plain.
 *
 * WHAT IS DELIBERATELY ABSENT. No fake metric, no invented customer count, no rating. The card
 * states what the product is and who runs it. A preview that overclaims is the first thing a
 * visitor sees and the first thing that has to be walked back.
 */

/* The card is rendered with a fixed palette rather than the site's CSS variables: this runs
   outside the document, where no stylesheet exists. Kept in step with paper.css by hand. */
const PAPER = '#F8FAFC'
const SLATE = '#334155'
const SLATE_SOFT = '#52647D'
const ORANGE = '#F35D19'

/**
 * The real mark, read off disk and inlined as a data URI.
 *
 * WHY NOT REDRAW IT. The first version of this card drew an approximation: a circle, two ellipses
 * and a letter F. It looked close enough at a glance and it was wrong, because the mark is the
 * client's own traced artwork (two paths, ~19 KB) and a lookalike in the one image that
 * represents the brand on someone else's timeline is the worst place to improvise.
 *
 * WHY A DATA URI AND NOT A URL. `next/og` renders through Satori, which fetches `<img src>`
 * itself; a `/geofold-mark.svg` reference would be a network request from inside the handler on
 * every crawler hit, and it fails silently (a blank space) when the fetch cannot resolve. Reading
 * the bytes once at module scope and inlining them removes the round-trip entirely.
 */
const MARK_DATA_URI = (() => {
  const svg = readFileSync(join(process.cwd(), 'public', 'geofold-mark.svg'))
  return `data:image/svg+xml;base64,${svg.toString('base64')}`
})()

export const runtime = 'nodejs'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: PAPER,
          padding: '64px 72px',
          /* A hairline of the marker orange across the top. It is the one flourish, and it ties
             the card to the site's own accent without a gradient or a glow. */
          borderTop: `10px solid ${ORANGE}`,
        }}
      >
        {/* ---- the lockup ---- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* The client's own artwork, not a redrawn stand-in. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- this is a Satori render
              target, not a DOM element; next/image does not exist inside ImageResponse. */}
          <img src={MARK_DATA_URI} width={76} height={56} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: SLATE, letterSpacing: '-0.02em' }}>
              {BUSINESS.brand}
            </div>
            <div style={{ fontSize: 20, color: SLATE_SOFT }}>{LEGAL.parent.name}</div>
          </div>
        </div>

        {/* ---- the claim ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 700,
              color: SLATE,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              maxWidth: 940,
            }}
          >
            Field surveys that never lose a point.
          </div>
          <div style={{ fontSize: 27, color: SLATE_SOFT, maxWidth: 900, lineHeight: 1.35 }}>
            Geo-tagged photos, offline capture, and every point on a map you can export.
          </div>
        </div>

        {/* ---- the trust line ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 20,
            color: SLATE_SOFT,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: 100, background: ORANGE }} />
            Android 7.0+ · Free to start
          </div>
          <div style={{ display: 'flex' }}>geofold.sayba.id</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
