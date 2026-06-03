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
import type { ApiResponse } from '../wallet/types'

export interface CardShopProduct {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  stock: number
}

export interface CardShopOrder {
  id: number
  product_id: number
  product_name: string
  trade_no: string
  amount: number
  money: number
  status: 'pending' | 'paid' | 'delivered' | 'cancelled'
  card_content?: string
  card_display?: string
  create_time: number
  complete_time?: number
}

// API Response types
export type ProductsResponse = ApiResponse<CardShopProduct[]>
export type ProductResponse = ApiResponse<CardShopProduct>
export type OrdersResponse = ApiResponse<{ items: CardShopOrder[]; total: number }>
export type OrderDetailResponse = ApiResponse<CardShopOrder>
export type CreateOrderResponse = ApiResponse<{
  payment_url?: string
  checkout_url?: string
  qr_code?: string
  order_id?: string
}>
