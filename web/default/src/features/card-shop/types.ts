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

// 已交付订单详情中返回的卡密（仅在 GET /orders/:id 的 data.card 中出现，列表接口不含）
export interface CardShopOrderCardDetail {
  id: number
  card_content: string
  card_display: string
  status: 'available' | 'sold' | 'reserved'
}

// 导入试算结果：后端按与真正导入一致的去重口径（批内 + 与既有库存）预估将入库的张数，
// 使前端「将导入张数」可精确等于入库数。new_count = total - batch_dup - existing_dup。
export interface CardImportPreview {
  total: number
  batch_dup: number
  existing_dup: number
  new_count: number
}

// API Response types
export type ProductsResponse = ApiResponse<CardShopProduct[]>
export type ProductResponse = ApiResponse<CardShopProduct>
export type CardsResponse = ApiResponse<{ items: CardShopCard[]; total: number }>
export type OrdersResponse = ApiResponse<{ items: CardShopOrder[]; total: number }>
// 后端 GetCardShopOrderDetail 返回嵌套结构 { order, card? }，而非扁平的订单对象。
export type OrderDetailResponse = ApiResponse<{
  order: CardShopOrder
  card?: CardShopOrderCardDetail
}>
export type CreateOrderResponse = ApiResponse<{
  payment_url?: string
  checkout_url?: string
  qr_code?: string
  order_id?: string
}>
