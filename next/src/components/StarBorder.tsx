'use client'

import type { ReactNode } from 'react'

/**
 * STAR BORDER — a travelling light along a control's own edge. Adapted from React Bits'
 * "StarBorder" / "Laser Flow".
 *
 * WHERE IT IS ALLOWED, AND WHY IT IS ONLY THERE. The brief names it for two things: the primary
 * CTA and the Premium pricing card. Both are the same object on this site — the recommended
 * plan's call to action — so it is applied once per page and nowhere else. A travelling light on
 * four controls is a fairground; on one it is the thing the eye lands on.
 *
 * WHAT WAS TAKEN AND WHAT WAS REDRAWN. The original wraps its children in a stack of divs with
 * two absolutely positioned gradient layers, and its light is driven by a CSS animation on a
 * custom property. The stack is the part worth keeping, because a border that travels has to be
 * OUTSIDE the element's own paint order or the button's own background covers it. The two layers
 * became one: the original draws a static gradient edge plus a moving highlight, and the static
 * half is already what `border-color` does on this button — so this draws only the light.
 *
 * IT WRAPS RATHER THAN REPLACES. The children are passed through untouched, so the anchor's
 * `href`, its client-side routing and its keyboard behaviour are all exactly what they were. The
 * light is a `::before` on a wrapping span, which takes no pointer events and is hidden from
 * assistive tech by being pure CSS.
 *
 * IT IS PURELY ADDITIVE. Under `prefers-reduced-motion` the animation stops and the gradient
 * sits at its initial angle: a static highlight along the control's edge. Nothing is hidden,
 * nothing moves, and the control is still the emphasised one — which is the correct degradation
 * for a decoration, and the reason it does not need a JS branch at all.
 */
export function StarBorder({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `gf-star ${className}` : 'gf-star'}>{children}</span>
}
