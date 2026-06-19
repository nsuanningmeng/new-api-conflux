import type { ApiResponse } from '../wallet/types'

export interface CardShopProduct {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  stock: number
}

export interface CardShopCard {
  id: number
  product_id: number
  card_display: string
  status: 'available' | 'sold' | 'reserved'
  order_id: number
  created_at: number
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
export type CardsResponse = ApiResponse<{ items: CardShopCard[]; total: number }>
export type OrdersResponse = ApiResponse<{ items: CardShopOrder[]; total: number }>
export type OrderDetailResponse = ApiResponse<CardShopOrder>
export type CreateOrderResponse = ApiResponse<{
  payment_url?: string
  checkout_url?: string
  qr_code?: string
  order_id?: string
}>
