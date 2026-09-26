/**
 * The GeoFold mark.
 *
 * WHAT IT IS. The real supplied artwork, vectorised from the source PNG into two paths — the blue
 * G whose counter holds a wireframe globe, and the orange F that tucks behind it. It is not a
 * redrawn lookalike: the outlines were traced off the source so the curves and the joins are the
 * client's own.
 *
 * WHY THERE ARE TWO FILES, AND WHY THIS SWITCHES BY THEME. Measured on the source: the grid lines
 * inside the G are not white ink at all, they are holes — those pixels are exactly the background
 * colour, and there is not one pure-white pixel in the file. The mark is a cut-out, so it inherits
 * whatever it sits on. On white that works with the brand blue; on the near-black dark theme the
 * blue falls to about 1.4:1 and the G effectively vanishes. The `-dark` file is the same geometry
 * with the blue repainted to a pale sky tint, which restores the contrast. Orange is untouched in
 * both — it reads strongly on either ground, and it is the accent that carries the brand.
 *
 * WHY BOTH IMAGES ARE IN THE DOM. Swapping `src` from JavaScript means the wrong variant paints
 * for a frame, and reading the theme in an effect means the server and client disagree on the
 * first render. Rendering both and letting CSS pick is the only approach that is correct before
 * hydration, which is exactly when the header is first painted.
 *
 * WHY AN <img> AND NOT INLINE SVG. The traced path is ~19 KB. Inlined, it would be parsed and
 * shipped on every page in the HTML; as files they are fetched once, cached, and block nothing.
 * `priority` is deliberately off — the mark never pushes content, so it must not compete with the
 * hero for bandwidth.
 */
export function Logo({
  size = 28,
  variant = 'auto',
  className,
  alt = 'GeoFold',
}: {
  /** Rendered height in px. The mark is wider than it is tall (578x429). */
  size?: number
  /**
   * `auto` follows the site theme (the default, and almost always what you want).
   * `light` pins the blue-on-light artwork; `dark` pins the pale artwork. Pin only on a surface
   * whose background does NOT follow the theme, e.g. a permanently navy band.
   */
  variant?: 'auto' | 'light' | 'dark'
  className?: string
  alt?: string
}) {
  // viewBox is 578x429, so width follows height at that ratio.
  const width = Math.round((size * 578) / 429)
  const base = `gf-logo${className ? ` ${className}` : ''}`

  /*
   * A plain <img>, deliberately — not next/image.
   *
   * These are SVG files served with `unoptimized`, which means next/image performs no resizing,
   * no format conversion and no CDN work: it is a plain <img> with extra attributes. It also
   * writes `display: block` as an INLINE STYLE, and an inline style beats the class that hides
   * the variant this theme does not use — so both marks painted at once, stacked, and the header
   * showed two logos. Losing next/image costs nothing here and removes the conflict entirely.
   *
   * `loading` is explicit because the header mark is above the fold and must not be deferred,
   * while the footer copy can be.
   */
  const mark = (src: string, which: 'light' | 'dark', accessible: boolean, eager: boolean) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={accessible ? alt : ''}
      aria-hidden={accessible ? undefined : true}
      width={width}
      height={size}
      className={`${base} gf-logo-${which}`}
      style={{ height: size, width: 'auto' }}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )

  // A pinned variant renders one file and never flips — no dead weight in the DOM.
  if (variant === 'light') return mark('/geofold-mark.svg', 'light', true, true)
  if (variant === 'dark') return mark('/geofold-mark-dark.svg', 'dark', true, true)

  // `auto`: both in the DOM, CSS reveals one. Only the visible one is announced, so a screen
  // reader says "GeoFold" once rather than twice.
  return (
    <span className="gf-logo-swap">
      {mark('/geofold-mark.svg', 'light', true, true)}
      {mark('/geofold-mark-dark.svg', 'dark', false, false)}
    </span>
  )
}

/**
 * The mark plus the wordmark, as one lockup.
 *
 * The wordmark is set in the site's own sans at 700 with a touch of negative tracking, which is
 * what the supplied artwork's lettering does. Keeping it as live text rather than tracing the
 * letterforms means it stays selectable, translatable and crisp at every size — and the mark
 * carries the brand on its own at the sizes where text would not read.
 */
export function LogoLockup({
  size = 26,
  variant = 'auto',
  className,
}: {
  size?: number
  variant?: 'auto' | 'light' | 'dark'
  className?: string
}) {
  return (
    <span className={`gf-lockup${className ? ` ${className}` : ''}`}>
      <Logo size={size} variant={variant} alt="" />
      <span className="gf-lockup-word">GeoFold</span>
    </span>
  )
}
