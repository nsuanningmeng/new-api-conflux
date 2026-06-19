import { api } from '@/lib/api'
import type { ApiResponse } from '../wallet/types'
import type {
  ProductsResponse,
  ProductResponse,
  CardsResponse,
  CreateOrderResponse,
  OrdersResponse,
  OrderDetailResponse,
} from './types'

export async function getCardShopProducts(): Promise<ProductsResponse> {
  const res = await api.get('/api/cardshop/products')
  return res.data
}

export async function getCardShopProduct(id: number): Promise<ProductResponse> {
  const res = await api.get(`/api/cardshop/products/${id}`)
  return res.data
}

export async function createCardShopOrder(productId: number): Promise<CreateOrderResponse> {
  const res = await api.post('/api/user/cardshop/order', { product_id: productId })
  return res.data
}

export async function getCardShopOrders(
  page: number,
  pageSize: number
): Promise<OrdersResponse> {
  const params = new URLSearchParams({
    p: page.toString(),
    page_size: pageSize.toString(),
  })
  const res = await api.get(`/api/user/cardshop/orders?${params.toString()}`)
  return res.data
}

export async function getCardShopOrderDetail(id: number): Promise<OrderDetailResponse> {
  const res = await api.get(`/api/user/cardshop/orders/${id}`)
  return res.data
}

// ============================================================================
// Admin API
// ============================================================================

export async function adminGetProducts(): Promise<ProductsResponse> {
  const res = await api.get('/api/user/cardshop/products')
  return res.data
}

export async function adminCreateProduct(product: Record<string, unknown>): Promise<ProductResponse> {
  const res = await api.post('/api/user/cardshop/product', product)
  return res.data
}

export async function adminUpdateProduct(id: number, product: Record<string, unknown>): Promise<ProductResponse> {
  const res = await api.put(`/api/user/cardshop/product/${id}`, product)
  return res.data
}

export async function adminDeleteProduct(id: number): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/user/cardshop/product/${id}`)
  return res.data
}

export async function adminImportCards(productId: number, cards: string[]): Promise<ApiResponse<{ count: number }>> {
  const res = await api.post(`/api/user/cardshop/product/${productId}/cards`, { cards })
  return res.data
}

export async function adminGetProductCards(
  productId: number,
  page: number,
  pageSize: number
): Promise<CardsResponse> {
  const params = new URLSearchParams({
    p: page.toString(),
    page_size: pageSize.toString(),
  })
  const res = await api.get(`/api/user/cardshop/product/${productId}/cards?${params.toString()}`)
  return res.data
}

export async function adminDeleteCard(cardId: number): Promise<ApiResponse<null>> {
  const res = await api.delete(`/api/user/cardshop/card/${cardId}`)
  return res.data
}

export async function adminGetAllOrders(
  page: number,
  pageSize: number,
  status?: string
): Promise<OrdersResponse> {
  const params = new URLSearchParams({
    p: page.toString(),
    page_size: pageSize.toString(),
  })
  if (status) params.append('status', status)
  const res = await api.get(`/api/user/cardshop/admin/orders?${params.toString()}`)
  return res.data
}

export async function adminManualDeliver(orderId: number): Promise<{ message: string }> {
  const res = await api.post(`/api/user/cardshop/admin/order/${orderId}/deliver`)
  return res.data
}
