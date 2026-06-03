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
