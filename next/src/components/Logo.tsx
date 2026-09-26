/**
 * The GeoFold mark.
 *
 * WHAT IT IS. The real supplied artwork, vectorised from the source PNG into two paths — the blue
 * G whose counter holds a wireframe globe, and the orange F that tucks behind it. It is not a
 * redrawn lookalike: the outlines were traced off the source so the curves and the joins are the
 * client's own.
 *
 * THE COLOURS ARE FROZEN. Blue #0246b1, orange #fa5f1f, in every theme. The mark is the mark; it
 * does not get recoloured to suit a background.
 *
 * WHY THAT IS NOT TRIVIAL. Measured on the source: the grid lines inside the G are not white ink
 * at all, they are holes — those pixels are exactly the background colour, and there is not one
 * pure-white pixel in the file. The mark is a cut-out, so it inherits whatever sits behind it. On
 * the light ground the brand blue measures 7.99:1 and everything is fine; on the dark theme's
 * ground it falls to 2.14:1 and the G effectively disappears.
 *
 * HOW THAT IS SOLVED, AND WHAT WAS REJECTED. Two wrong answers were tried first. Repainting the
 * blue to a pale tint "fixed" the contrast by destroying the brand. Plating the mark on its own
 * light rectangle kept the colours but put a stray white box in a dark header, which is not what
 * the mark should look like.
 *
 * The answer is the third one, and it is the one the artwork was asking for: THE MARK IS ALWAYS ON
 * A LIGHT GROUND, AND THE GROUND IS THE CHROME. In dark mode the header and footer bands stay
 * light (see the `.mk-nav` / `.mk-footer` rules in paper.css) while the content between them goes
 * dark, so the mark sits on the same surface it does in light mode and reads IDENTICALLY in both
 * themes. Because the globe lines are holes, they then show that same light surface. Nothing about
 * the artwork changes, no plate is drawn, and the only thing that differs between themes is the
 * background of the two bands that hold the logo.
 *
 * WHY THAT IS ALSO GOOD DESIGN, not just a workaround: the header and footer become a consistent
 * "map sheet" edge around the content, which is what a survey sheet is — a light border with the
 * field in the middle. The chrome stays stable while the content is what changes.
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
 */
export function LogoLockup({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={`gf-lockup${className ? ` ${className}` : ''}`}>
      <Logo size={size} alt="" />
      <span className="gf-lockup-word">GeoFold</span>
    </span>
  )
}
