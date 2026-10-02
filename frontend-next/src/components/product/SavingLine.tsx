'use client'

import { Trans } from 'react-i18next'
import { formatPrice } from '../../lib/format'

/**
 * «На X ₸ дешевле, чем в <сеть>»: фраза графитом, сумма — акцентом, чтобы цифра считывалась первой.
 * Без store — короткая «Выгоднее на X ₸» (компактная карточка)
 */
export function SavingLine({ amount, store, className = '' }: { amount: number; store?: string; className?: string }) {
  return (
    <p className={`text-ink ${className}`}>
      <Trans
        i18nKey={store === undefined ? 'card.savingShort' : 'card.saving'}
        values={{ amount: formatPrice(amount), store }}
        components={{ price: <span className="font-semibold whitespace-nowrap text-accent tabular" /> }}
      />
    </p>
  )
}
