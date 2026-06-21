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
  onViewDetails?: (product: CardShopProduct) => void
  loading?: boolean
}

export function ProductCard({ product, onBuy, onViewDetails, loading }: ProductCardProps) {
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
        <div className="relative aspect-[4/3] w-full">
          <button
            type="button"
            onClick={() => onViewDetails?.(product)}
            aria-label={t('View Details')}
            disabled={!onViewDetails}
            className="flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-muted to-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default"
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <PackageIcon className="size-12 text-muted-foreground/40" />
            )}
          </button>
          <div className="pointer-events-none absolute right-2 top-2">
            {isOutOfStock ? (
              <Badge variant="destructive">{t('Sold Out')}</Badge>
            ) : isLowStock ? (
              <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
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
        {/* 卡片只展示 2 行预览；完整说明（含 Markdown/HTML/图片）在「查看详情」弹窗中渲染。 */}
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {product.description || t('No description available.')}
        </p>
        <div className="mt-3 text-2xl font-bold text-primary">
          {formatLocalCurrencyAmount(product.price)}
        </div>
      </CardContent>

      <CardFooter className="border-t-0 bg-transparent px-4 pb-4 pt-0 gap-2">
        {onViewDetails && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onViewDetails(product)}
          >
            {t('View Details')}
          </Button>
        )}
        <Button
          className="flex-1 gap-1.5"
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
