/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState, useCallback } from 'react'
import i18next from 'i18next'
import { isSafeHttpPaymentUrl } from '@/lib/utils'
import { toast } from 'sonner'
import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoPancakeAmount,
  calculateConfluxAPIAmount,
  requestPayment,
  requestStripePayment,
  requestConfluxAPIPayment,
  isApiSuccess,
} from '../api'
import {
  isConfluxAPIPayment,
  isStripePayment,
  isWaffoPancakePayment,
  submitPaymentForm,
} from '../lib'

// ============================================================================
// Payment Hook
// ============================================================================

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)

        const isStripe = isStripePayment(paymentType)
        const isPancake = isWaffoPancakePayment(paymentType)
        const isConfluxAPI = isConfluxAPIPayment(paymentType)
        const response = isStripe
          ? await calculateStripeAmount({ amount: topupAmount })
          : isPancake
            ? await calculateWaffoPancakeAmount({ amount: topupAmount })
            : isConfluxAPI
              ? await calculateConfluxAPIAmount({ amount: topupAmount })
              : await calculateAmount({ amount: topupAmount })

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = parseFloat(response.data)
          setAmount(calculatedAmount)
          return calculatedAmount
        }

        // Don't show error for calculation, just set to 0
        setAmount(0)
        return 0
      } catch (_error) {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const isConfluxAPI = isConfluxAPIPayment(paymentType)
        const amount = Math.floor(topupAmount)

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : isConfluxAPI
            ? await requestConfluxAPIPayment({ amount })
            : await requestPayment({
                amount,
                payment_method: paymentType,
              })

        if (!isApiSuccess(response)) {
          toast.error(response.message || i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        const stripePayLink = isStripe ? getStripePayLink(response.data) : null
        if (stripePayLink) {
          window.open(stripePayLink, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        if (isConfluxAPI && response.data) {
          const paymentUrl = getConfluxAPIPaymentUrl(response.data)
          if (paymentUrl) {
            if (!isSafeHttpPaymentUrl(paymentUrl)) {
              toast.error(i18next.t('Invalid payment redirect URL'))
              return false
            }
            window.location.assign(paymentUrl)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        // Handle non-Stripe payment
        if (!isStripe && isRecord(response.data)) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            submitPaymentForm(url, response.data)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (_error) {
        toast.error(i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}

function getStripePayLink(data: unknown): string | null {
  if (!isRecord(data) || typeof data.pay_link !== 'string') {
    return null
  }
  return data.pay_link
}

function getConfluxAPIPaymentUrl(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) {
    return data
  }
  if (!isRecord(data)) {
    return null
  }

  for (const key of ['checkout_url', 'payment_url', 'qr_code']) {
    if (typeof data[key] === 'string') {
      const value = data[key]
      if (value.trim()) return value
    }
  }
  return null
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}
