import type { ReactNode } from 'react'

/**
 * A phone frame with an app screen drawn inside it, in CSS.
 *
 * Deliberately not screenshots. Real captures of this app show real survey points from real
 * projects — coordinates of actual field sites, which is not something to publish on a marketing
 * page — and they would need retaking every time the UI moved. These are schematic: they show the
 * shape and rhythm of each screen honestly without claiming to be a photograph of one, and they
 * stay sharp at any size and weigh nothing on a slow connection.
 */

export function PhoneMock({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="mk-phone">
      <div className="mk-phone-frame">
        <div className="mk-phone-notch" />
        <div className="mk-phone-screen">{children}</div>
      </div>
      {caption && <div className="mk-phone-cap">{caption}</div>}
    </div>
  )
}

/** Capture: the viewfinder with the coordinate stamp that ends up burned into the photo. */
export function ScreenCapture() {
  return (
    <div className="mk-scr mk-scr-capture">
      <div className="mk-scr-bar">
        <span>Kampung Durian</span>
        <span className="mk-scr-dot" />
      </div>
      <div className="mk-scr-view">
        <div className="mk-scr-reticle" />
        <div className="mk-scr-stamp">
          <div>-0.0234, 109.3421</div>
          <div>±4 m · 07/09 14:22</div>
        </div>
      </div>
      <div className="mk-scr-shutter">
        <span />
      </div>
    </div>
  )
}

/** Records: the list of captured points with their sync state. */
export function ScreenRecords() {
  const rows = [
    { ref: 'KD-014', meta: '±3 m · tersinkron', ok: true },
    { ref: 'KD-013', meta: '±6 m · tersinkron', ok: true },
    { ref: 'KD-012', meta: '±4 m · menunggu sinyal', ok: false },
    { ref: 'KD-011', meta: '±5 m · tersinkron', ok: true },
  ]
  return (
    <div className="mk-scr">
      <div className="mk-scr-head">Records</div>
      <div className="mk-scr-chips">
        <span className="on">Semua</span>
        <span>Pending</span>
        <span>Synced</span>
      </div>
      {rows.map((r) => (
        <div className="mk-scr-row" key={r.ref}>
          <div className="mk-scr-thumb" />
          <div>
            <div className="mk-scr-ref">{r.ref}</div>
            <div className="mk-scr-meta">{r.meta}</div>
          </div>
          <span className={`mk-scr-pill ${r.ok ? 'ok' : 'wait'}`} />
        </div>
      ))}
    </div>
  )
}

/** Map: points over a grid, the premium view. */
export function ScreenMap() {
  const pins = [
    { x: 26, y: 30 },
    { x: 58, y: 24 },
    { x: 40, y: 48 },
    { x: 70, y: 55 },
    { x: 33, y: 66 },
    { x: 62, y: 74 },
  ]
  return (
    <div className="mk-scr mk-scr-map">
      <div className="mk-scr-head">Peta survei</div>
      <div className="mk-scr-canvas">
        <div className="mk-scr-grid" />
        {pins.map((p, i) => (
          <span key={i} className="mk-scr-pin" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
        ))}
        <div className="mk-scr-cell">C4 · 6 titik</div>
      </div>
    </div>
  )
}

/** Export: the spreadsheet that comes out the other end. */
export function ScreenExport() {
  return (
    <div className="mk-scr">
      <div className="mk-scr-head">Ekspor</div>
      <div className="mk-scr-sheet">
        <div className="mk-scr-sheet-head">
          <span>Ref</span>
          <span>Lat</span>
          <span>Foto</span>
        </div>
        {['KD-014', 'KD-013', 'KD-012', 'KD-011', 'KD-010'].map((ref) => (
          <div className="mk-scr-sheet-row" key={ref}>
            <span>{ref}</span>
            <span>-0.023…</span>
            <span className="mk-scr-cellimg" />
          </div>
        ))}
      </div>
      <div className="mk-scr-formats">
        <span>.xlsx</span>
        <span>.csv</span>
      </div>
    </div>
  )
}

/** Drone: the aerial HUD. */
export function ScreenDrone() {
  return (
    <div className="mk-scr mk-scr-drone">
      <div className="mk-scr-view drone">
        <div className="mk-scr-hud">
          <span>ALT 42 m</span>
          <span>SAT 14</span>
          <span>BAT 78%</span>
        </div>
        <div className="mk-scr-mini">
          <div className="mk-scr-grid sm" />
        </div>
        <div className="mk-scr-stamp">
          <div>MAVIC MINI · terhubung</div>
        </div>
      </div>
      <div className="mk-scr-shutter">
        <span />
      </div>
    </div>
  )
}
