'use client'

import { useState } from 'react'
import { CheckoutModal } from './CheckoutModal'

interface PricingCheckoutButtonProps {
  label: string
  className?: string
  offerLabel?: string
  storageLabel?: string
}

export function PricingCheckoutButton({
  label,
  className = 'mk-btn mk-btn-primary',
  offerLabel = 'Rp 35.000',
  storageLabel = '500 MB',
}: PricingCheckoutButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        style={{ cursor: 'pointer' }}
      >
        {label}
      </button>
      <CheckoutModal
        isOpen={open}
        onClose={() => setOpen(false)}
        offerLabel={offerLabel}
        storageLabel={storageLabel}
      />
    </>
  )
}
