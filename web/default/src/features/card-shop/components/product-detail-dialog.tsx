import { useTranslation } from 'react-i18next'
import { PackageIcon, ShoppingCartIcon } from 'lucide-react'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { SafeMarkdown } from './safe-markdown'
import type { CardShopProduct } from '../types'

// 低库存阈值：与 product-card 保持一致
const LOW_STOCK_THRESHOLD = 5

interface ProductDetailDialogProps {
  product: CardShopProduct | null
  open: boolean
  onClose: () => void
  onBuy: (product: CardShopProduct) => void
  loading?: boolean
}

export function ProductDetailDialog({
  product,
  open,
  onClose,
  onBuy,
  loading,
}: ProductDetailDialogProps) {
  const { t } = useTranslation()
  const isOutOfStock = !!product && product.stock <= 0
  const isLowStock = !!product && !isOutOfStock && product.stock <= LOW_STOCK_THRESHOLD

  return (
    <Dialog
      open={open}
      onOpenChange={(o: boolean) => {
        if (!o) onClose()
      }}
      title={product?.name ?? ''}
      contentClassName="sm:max-w-2xl"
      contentHeight="auto"
      bodyClassName="space-y-4"
      footer={
        product ? (
          <Button
            className="w-full gap-1.5"
            disabled={isOutOfStock || loading}
            onClick={() => onBuy(product)}
          >
            {!isOutOfStock && <ShoppingCartIcon className="size-4" />}
            {isOutOfStock ? t('Sold Out') : t('Buy Now')}
          </Button>
        ) : null
      }
    >
      {product && (
        <div className="space-y-4">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-muted to-muted/40">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <PackageIcon className="size-12 text-muted-foreground/40" />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-2xl font-bold text-primary">
              {formatLocalCurrencyAmount(product.price)}
            </div>
            {isOutOfStock ? (
              <Badge variant="destructive">{t('Sold Out')}</Badge>
            ) : isLowStock ? (
              <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {t('Only {{count}} left', { count: product.stock })}
              </Badge>
            ) : (
              <Badge variant="secondary">
                {t('Stock')}: {product.stock}
              </Badge>
            )}
          </div>

          <div className="border-t pt-4">
            {product.description ? (
              <SafeMarkdown>{product.description}</SafeMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('No description available.')}
              </p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
