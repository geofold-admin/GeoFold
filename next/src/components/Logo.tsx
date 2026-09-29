/**
 * The GeoFold mark.
 *
 * WHAT IT IS. The real supplied artwork, vectorised from the source PNG into two paths — the blue
 * G whose counter holds a wireframe globe, and the orange F that tucks behind it. It is not a
 * redrawn lookalike: the outlines were traced off the source so the curves and the joins are the
 * client's own.
 *
 * THE MARK IS A CUT-OUT, AND THAT IS THE WHOLE STORY OF THIS FILE. The grid lines inside the G are
 * not white ink — those pixels are holes that show whatever is behind them, and there is not one
 * pure-white pixel in the artwork. So the mark is only legible where the ground behind it is
 * light enough for #0246b1 to read on: 7.99:1 on white, 2.14:1 on a midnight plate.
 *
 * WHY THERE IS NO LONGER A PLATE. This file used to wrap the mark in a white DISC (`.gf-plate`)
 * because the chrome of the day was dark and the blue G vanished on it. The client has now asked
 * for the plate to go, in as many words: "pada logo tidak perlu di beri latar putih kecuali
 * pavicon nya" — no white background behind the logo, except the favicon.
 *
 * That request is only safe because the chrome is no longer dark. `minimal.css` gives the
 * marketing header and footer a white ground, and the app chrome is light too, so the mark sits on
 * the ground it was drawn for and the plate has nothing left to do. The rule this file now
 * follows is the simple one: THE MARK IS DRAWN ON A LIGHT GROUND, WITH NOTHING BEHIND IT. If a
 * dark ground is ever reintroduced, this is the decision that has to be revisited — not by
 * silently re-adding the disc, but by checking what the blue actually measures on the new ground.
 *
 * THE FAVICON IS THE ONE EXCEPTION, and it is the client's own carve-out. A browser tab strip is
 * light or dark depending on the user's theme, and a 16px cut-out with transparent holes in it
 * reads as a smudge on either. `src/app/icon.svg` therefore puts the mark on an opaque white
 * square. That file is separate from this one precisely because the two have different jobs: this
 * is the mark in the page, that is the mark in the browser chrome.
 *
 * WHY ONE IMAGE AND NOT TWO. There used to be a second, plated file with CSS to pick between them.
 * With a single artwork that is correct on both grounds that machinery has no job: one <img>,
 * always the same file, no swap, no per-theme branch, and nothing that can disagree before
 * hydration.
 *
 * WHY AN <img> AND NOT INLINE SVG. The traced path is ~19 KB. Inlined, it would be parsed and
 * shipped on every page in the HTML; as a file it is fetched once, cached, and blocks nothing.
 */
export function Logo({
  size = 28,
  className,
  alt = 'GeoFold',
}: {
  /** Rendered height in px. The mark is wider than it is tall (578x429). */
  size?: number
  className?: string
  alt?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the file is an SVG served as-is, so
    // next/image would add an optimizer round-trip and an inline `display:block` style while
    // changing nothing about the bytes. A plain <img> is the honest element here.
    <img
      src="/geofold-mark.svg"
      alt={alt}
      width={578}
      height={429}
      className={`gf-logo${className ? ` ${className}` : ''}`}
      style={{ height: size, width: 'auto' }}
      /* The header mark is above the fold and must not be deferred; the footer copy may be. */
      loading={size >= 28 ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}

/**
 * The mark plus the wordmark, as one lockup.
 *
 * The wordmark is set in the site's own sans at 700 with a touch of negative tracking, which is
 * what the supplied artwork's lettering does. Keeping it as live text rather than tracing the
 * letterforms means it stays selectable, translatable and crisp at every size — and the mark
 * carries the brand on its own at the sizes where text would not read.
 *
 * WHY THE DISC IS GONE (2026-09-30). It was added because the Midnight chrome was dark and the
 * mark's own cut-out lines measured 2.14:1 on it. The chrome is light now, so the disc has no job:
 * it was drawing a white circle on a white bar, which is exactly the "white background behind the
 * logo" the client asked to be removed. The markup keeps `.gf-plate` as a plain layout box — it
 * still centres the artwork — but it paints nothing. The paint rule lives in `minimal.css`.
 */
export function LogoLockup({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={`gf-lockup${className ? ` ${className}` : ''}`}>
      <span className="gf-plate" style={{ width: size * 1.45, height: size * 1.45 }}>
        <Logo size={size * 0.88} alt="" />
      </span>
      <span className="gf-lockup-word">GeoFold</span>
    </span>
  )
}
