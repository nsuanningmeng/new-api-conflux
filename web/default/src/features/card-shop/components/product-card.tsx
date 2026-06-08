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
import { useTranslation } from 'react-i18next'
import { PackageIcon, ShoppingCartIcon } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import type { CardShopProduct } from '../types'

// 低库存阈值：低于此值时显示紧迫感提示「仅剩 N 件」
const LOW_STOCK_THRESHOLD = 5

interface ProductCardProps {
  product: CardShopProduct
  onBuy: (product: CardShopProduct) => void
  loading?: boolean
}

export function ProductCard({ product, onBuy, loading }: ProductCardProps) {
  const { t } = useTranslation()
  const isOutOfStock = product.stock <= 0
  const isLowStock = !isOutOfStock && product.stock <= LOW_STOCK_THRESHOLD

  return (
    <Card
      className={cn(
        'group h-full flex flex-col overflow-hidden p-0 transition-all duration-200',
        !isOutOfStock && 'hover:-translate-y-1 hover:shadow-lg hover:border-primary/30'
      )}
    >
      <CardHeader className="p-0">
        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-muted to-muted/40">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <PackageIcon className="size-12 text-muted-foreground/40" />
          )}
          <div className="absolute right-2 top-2">
            {isOutOfStock ? (
              <Badge variant="destructive">{t('Sold Out')}</Badge>
            ) : isLowStock ? (
              <Badge className="border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {t('Only {{count}} left', { count: product.stock })}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-background/85 text-foreground backdrop-blur">
                {t('Stock')}: {product.stock}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <h3 className="line-clamp-1 font-semibold">{product.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {product.description || t('No description available.')}
        </p>
        <div className="mt-3 text-2xl font-bold text-primary">
          {formatLocalCurrencyAmount(product.price)}
        </div>
      </CardContent>

      <CardFooter className="border-t-0 bg-transparent px-4 pb-4 pt-0">
        <Button
          className="w-full gap-1.5"
          disabled={isOutOfStock || loading}
          onClick={() => onBuy(product)}
        >
          {!isOutOfStock && <ShoppingCartIcon className="size-4" />}
          {isOutOfStock ? t('Sold Out') : t('Buy Now')}
        </Button>
      </CardFooter>
    </Card>
  )
}
