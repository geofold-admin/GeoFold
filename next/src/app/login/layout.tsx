import type { ReactNode } from 'react'
import { Work_Sans } from 'next/font/google'
import '@/styles/marketing.css'
// The layer that carries the dark palette's ground and the account/ledger components. These
// three pages sit outside the (marketing) layout, so without this they take marketing.css's
// DARK tokens with no dark surface under them: white ink on the portal's light paper.
import '@/styles/corporate.css'
// The Blueprint layer: the client's palette, the four typefaces, and the 0px corners. These
// three pages sit outside the (marketing) layout, so without this import they would keep the
// older skins' radii and their Inter fallbacks — the sign-in form would be the one screen on
// the site with 6px buttons. It is loaded after corporate.css for the same reason it is on the
// marketing site: last wins, and it only restates what the brief changes.
import '@/styles/blueprint.css'

// The portal sign-in sits on the marketing brand rather than the app theme, per the design.
const workSans = Work_Sans({
  variable: '--font-work',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={`mk ${workSans.variable}`}>{children}</div>
}
