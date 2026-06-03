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
import i18next from 'i18next'

/**
 * Format card content for display
 */
export function formatCardContent(content: string): string {
  if (!content) return ''
  return content.trim()
}

/**
 * Get order status localized label
 */
export function getOrderStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return i18next.t('Pending Payment')
    case 'paid':
      return i18next.t('Paid')
    case 'delivered':
      return i18next.t('Delivered')
    case 'cancelled':
      return i18next.t('Cancelled')
    default:
      return status
  }
}

/**
 * Get order status color
 */
export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'paid':
      return 'secondary'
    case 'delivered':
      return 'success'
    case 'cancelled':
      return 'destructive'
    default:
      return 'default'
  }
}
