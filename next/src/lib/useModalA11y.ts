'use client'

import { useEffect, useRef } from 'react'

/**
 * The three things every modal has to do to the page behind it, in one hook.
 *
 * WHY THIS EXISTS. A dialog that looks right but leaves the page behind it live is the most
 * common way a checkout feels broken: the wheel scrolls the marketing page under the overlay, so
 * the modal appears to drift; Tab walks out of the dialog and into links the buyer cannot see,
 * so screen-reader and keyboard users lose the thread; and closing it dumps focus at the top of
 * the document, so the buyer has to find their place again. None of those are visible in a
 * screenshot, which is why they survive review.
 *
 * SCROLL LOCK. `overflow: hidden` on <body> is the usual fix and it is wrong on its own: the
 * moment the scrollbar disappears the layout reflows wider by its width, so the whole page jumps
 * sideways. This measures that width first and pays it back as padding-right. It also records
 * scrollY and restores it on unlock, because some browsers (iOS Safari in particular) reset the
 * scroll offset when the body is locked.
 *
 * FOCUS TRAP. Tab and Shift+Tab are wrapped between the first and last focusable element rather
 * than merely keeping focus "somewhere inside" — that is what makes Shift+Tab off the first
 * element land on the last one instead of escaping to the browser chrome. Focus moves into the
 * dialog on open (the dialog itself if it has no focusable children) and returns to whatever was
 * focused before it opened, which is what makes Escape feel like undo.
 *
 * Everything here is torn down on unmount and is safe under React strict mode's double-invoke:
 * each effect undoes exactly what it did.
 */
export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  /** Optional ref to the scrollable dialog box. Focus lands here when it has no focusable children. */
  panelRef?: React.RefObject<HTMLElement | null>,
) {
  // Remembers what had focus before the dialog opened, so it can be handed back on close.
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const panel = panelRef?.current ?? null

    /* ---- 1. remember + move focus in ---- */
    restoreRef.current = (document.activeElement as HTMLElement) ?? null

    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null || el === document.activeElement)
        : []

    /*
     * Focus the DIALOG, not its first control.
     *
     * This is the WAI-ARIA dialog pattern, and the reason is not cosmetic: the first focusable
     * element here is the close button, so focusing it means a stray Space or Enter — which is how
     * a lot of people scroll a page — dismisses the checkout before they have read a word of it.
     * Focusing the container announces the dialog and its label to a screen reader and leaves
     * Space inert; one Tab from there lands on the close button as before.
     */
    panel?.focus({ preventScroll: true })

    /* ---- 2. lock the page behind ---- */
    const body = document.body
    const scrollY = window.scrollY
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const prevPosition = body.style.position
    const prevTop = body.style.top
    const prevWidth = body.style.width

    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

    // iOS Safari ignores `overflow: hidden` on the body for touch scrolling. Pinning the body
    // with position:fixed at a negative offset is the only reliable lock there, and the offset is
    // what keeps the page looking like it has not moved.
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isIOS) {
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.width = '100%'
    }

    /* ---- 3. keep the keyboard inside, and Escape closes ---- */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        // Nothing to focus: hold focus on the panel so Tab cannot reach the page behind.
        e.preventDefault()
        panel?.focus({ preventScroll: true })
        return
      }

      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null

      // Focus is on the panel itself (where we put it on open). Tab should move forward into the
      // first control, and Shift+Tab must wrap to the last — otherwise it walks out of the dialog
      // into the page behind, which is the exact thing this trap exists to prevent.
      if (active === panel) {
        if (e.shiftKey) {
          e.preventDefault()
          lastEl.focus({ preventScroll: true })
        }
        return
      }

      // If focus has already escaped (clicked on the backdrop, say), pull it back to an end.
      if (!active || !panel?.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? lastEl : firstEl).focus({ preventScroll: true })
        return
      }
      if (e.shiftKey && active === firstEl) {
        e.preventDefault()
        lastEl.focus({ preventScroll: true })
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus({ preventScroll: true })
      }
    }

    // Capture phase, so this runs before any handler inside the dialog.
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)

      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
      body.style.position = prevPosition
      body.style.top = prevTop
      body.style.width = prevWidth
      window.scrollTo(0, scrollY)

      // Hand focus back to the control that opened the dialog, if it is still on the page.
      const back = restoreRef.current
      if (back && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [isOpen, onClose, panelRef])
}
