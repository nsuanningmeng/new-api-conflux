import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCardShopProducts,
  getCardShopOrders,
  createCardShopOrder,
  getCardShopOrderDetail,
  adminGetProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminImportCards,
  adminGetAllOrders,
} from '../api'

/**
 * Hook for getting all products
 */
export function useCardShopProducts() {
  return useQuery({
    queryKey: ['card-shop-products'],
    queryFn: getCardShopProducts,
  })
}

/**
 * Hook for getting user orders
 */
export function useCardShopOrders(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['card-shop-orders', page, pageSize],
    queryFn: () => getCardShopOrders(page, pageSize),
  })
}

/**
 * Hook for creating a new order
 */
export function useCreateOrder() {
  return useMutation({
    mutationFn: (productId: number) => createCardShopOrder(productId),
  })
}

/**
 * Hook for getting order details
 */
export function useOrderDetail(id: number) {
  return useQuery({
    queryKey: ['card-shop-order', id],
    queryFn: () => getCardShopOrderDetail(id),
    enabled: !!id,
  })
}

/**
 * Admin: Hook for getting all products
 */
export function useAdminCardShopProducts() {
  return useQuery({
    queryKey: ['admin-card-shop-products'],
    queryFn: adminGetProducts,
  })
}

/**
 * Admin: Hook for creating/updating product
 */
export function useAdminCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (product: Record<string, unknown>) => adminCreateProduct(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-card-shop-products'] })
      queryClient.invalidateQueries({ queryKey: ['card-shop-products'] })
    },
  })
}

export function useAdminUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, product }: { id: number; product: Record<string, unknown> }) => adminUpdateProduct(id, product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-card-shop-products'] })
      queryClient.invalidateQueries({ queryKey: ['card-shop-products'] })
    },
  })
}

/**
 * Admin: Hook for deleting product
 */
export function useAdminDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminDeleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-card-shop-products'] })
      queryClient.invalidateQueries({ queryKey: ['card-shop-products'] })
    },
  })
}

/**
 * Admin: Hook for importing cards
 */
export function useAdminImportCards() {
  return useMutation({
    mutationFn: ({ productId, cards }: { productId: number; cards: string[] }) =>
      adminImportCards(productId, cards),
  })
}

/**
 * Admin: Hook for getting all orders
 */
export function useAdminAllOrders(page: number, pageSize: number, status?: string) {
  return useQuery({
    queryKey: ['admin-card-shop-orders', page, pageSize, status],
    queryFn: () => adminGetAllOrders(page, pageSize, status),
  })
}
