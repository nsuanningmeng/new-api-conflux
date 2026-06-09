import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ShoppingBagIcon, ZapIcon, ShieldCheckIcon, RefreshCwIcon, HistoryIcon, PackageOpenIcon } from 'lucide-react'
import { isSafeHttpPaymentUrl } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
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
      // 仅处理成功路径；业务失败（success:false）与网络错误均由 axios 拦截器统一弹出 res.message，避免重复 toast。
      if (res.success && res.data) {
        const url = res.data.payment_url || res.data.checkout_url
        if (url && isSafeHttpPaymentUrl(url)) {
          window.location.href = url
        } else {
          toast.success(t('Order created successfully'))
        }
      }
    } catch {
      /* 网络/HTTP 错误已由拦截器处理 */
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-7xl mx-auto">
      {/* Hero banner — 突出 AI 账号商城卖点 */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
        <Button
          variant="outline"
          size="sm"
          className="absolute right-4 top-4 z-10 gap-1.5 bg-background/70 backdrop-blur"
          render={<Link to="/card-shop/orders" />}
        >
          <HistoryIcon className="size-4" />
          <span className="hidden sm:inline">{t('View My Orders')}</span>
        </Button>

        <div className="relative z-10 flex flex-col gap-3">
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold tracking-tight">
            <ShoppingBagIcon className="size-7 text-primary" />
            {t('AI Account Shop')}
          </h1>
          <p className="max-w-2xl text-sm sm:text-base text-muted-foreground">
            {t('AI Account Shop description')}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
            <TrustBadge icon={<ZapIcon className="size-4 text-amber-500" />} label={t('Instant Delivery')} />
            <TrustBadge icon={<ShieldCheckIcon className="size-4 text-emerald-500" />} label={t('Secure Payment')} />
            <TrustBadge icon={<RefreshCwIcon className="size-4 text-sky-500" />} label={t('Auto Delivery')} />
          </div>
        </div>

        <ShoppingBagIcon className="pointer-events-none absolute -bottom-8 -right-6 size-44 text-primary/5" />
      </section>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
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
          <PackageOpenIcon className="size-12 mb-4 text-muted-foreground/50" />
          <p className="text-lg">{t('No products available at the moment')}</p>
        </div>
      )}
    </div>
  )
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
      {icon}
      {label}
    </div>
  )
}
