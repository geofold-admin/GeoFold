import type { ReactNode } from 'react'
import { Work_Sans } from 'next/font/google'
import '@/styles/marketing.css'
// The layer that carries the dark palette's ground and the account/ledger components. These
// three pages sit outside the (marketing) layout, so without this they take marketing.css's
// DARK tokens with no dark surface under them: white ink on the portal's light paper.
import '@/styles/corporate.css'

// Password reset shares the portal's marketing brand, not the app theme — same as /login.
const workSans = Work_Sans({
  variable: '--font-work',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default function ResetLayout({ children }: { children: ReactNode }) {
  return <div className={`mk ${workSans.variable}`}>{children}</div>
}
