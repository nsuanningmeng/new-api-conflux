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
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ShoppingCartIcon } from 'lucide-react'
import { isSafeHttpPaymentUrl } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ProductCard } from '@/features/card-shop/components/product-card'
import { useCardShopProducts, useCreateOrder } from '@/features/card-shop/hooks/use-card-shop'
import type { CardShopProduct } from '@/features/card-shop/types'

export const Route = createFileRoute('/_authenticated/card-shop/')({
  component: CardShopPage,
})

function CardShopPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useCardShopProducts()
  const createOrder = useCreateOrder()

  const products = data?.data || []

  const handleBuy = async (product: CardShopProduct) => {
    try {
      const res = await createOrder.mutateAsync(product.id)
      if (res.success && res.data) {
        const url = res.data.payment_url || res.data.checkout_url
        if (url && isSafeHttpPaymentUrl(url)) {
          window.location.href = url
        } else {
          toast.success(t('Order created successfully'))
          // Optionally handle QR code or internal redirect
        }
      } else {
        toast.error(res.message || t('Failed to create order'))
      }
    } catch (err: any) {
      toast.error(err.message || t('Failed to create order'))
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <ShoppingCartIcon className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">{t('AI Account Shop')}</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onBuy={handleBuy}
              loading={createOrder.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
          <ShoppingCartIcon className="size-12 mb-4 text-muted-foreground/50" />
          <p className="text-lg">{t('No products available at the moment')}</p>
        </div>
      )}
    </div>
  )
}
