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
import { PackageIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import type { CardShopProduct } from '../types'

interface ProductCardProps {
  product: CardShopProduct
  onBuy: (product: CardShopProduct) => void
  loading?: boolean
}

export function ProductCard({ product, onBuy, loading }: ProductCardProps) {
  const { t } = useTranslation()
  const isOutOfStock = product.stock <= 0

  return (
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="p-0">
        <div className="aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <PackageIcon className="size-12 text-muted-foreground/40" />
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <CardTitle className="line-clamp-1">{product.name}</CardTitle>
          <Badge variant={isOutOfStock ? 'destructive' : 'secondary'}>
            {isOutOfStock ? t('Sold Out') : `${t('Stock')}: ${product.stock}`}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2 min-h-10">
          {product.description || t('No description available')}
        </CardDescription>
        <div className="mt-4 text-xl font-bold text-primary">
          {formatLocalCurrencyAmount(product.price)}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          className="w-full"
          disabled={isOutOfStock || loading}
          onClick={() => onBuy(product)}
        >
          {isOutOfStock ? t('Sold Out') : t('Buy Now')}
        </Button>
      </CardFooter>
    </Card>
  )
}
