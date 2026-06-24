import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HistoryIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OrderList } from '@/features/card-shop/components/order-list'
import { CardContentDisplay } from '@/features/card-shop/components/card-content-display'
import { useCardShopOrders, useOrderDetail } from '@/features/card-shop/hooks/use-card-shop'
import { DEFAULT_PAGE_SIZE } from '@/features/card-shop/constants'
import type { CardShopOrder } from '@/features/card-shop/types'

export const Route = createFileRoute('/_authenticated/card-shop/orders')({
  component: MyOrdersPage,
})

function MyOrdersPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState<CardShopOrder | null>(null)
  const { data, isLoading } = useCardShopOrders(page, DEFAULT_PAGE_SIZE)

  const orders = data?.data?.items || []
  const total = data?.data?.total || 0
  const totalPages = Math.ceil(total / DEFAULT_PAGE_SIZE)

  // 已交付订单的卡密只在订单详情接口（GET /orders/:id 的 data.card）返回，列表接口不含；
  // 因此选中一个已交付订单时再按需拉取详情。传 0 让 useOrderDetail 的 enabled 关闭查询。
  const detailOrderId = selectedOrder?.status === 'delivered' ? selectedOrder.id : 0
  const { data: detailData, isLoading: detailLoading, isError: detailError } =
    useOrderDetail(detailOrderId)
  const cardContent = detailData?.data?.card?.card_content

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <HistoryIcon className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">{t('My Orders')}</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <OrderList
            orders={orders}
            onViewDetails={(order) => setSelectedOrder(order)}
          />
          
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                {t('Previous')}
              </Button>
              <span className="flex items-center px-4 text-sm font-medium">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Order Details')}</DialogTitle>
            <DialogDescription>
              {selectedOrder?.product_name} - {selectedOrder?.trade_no}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedOrder?.status === 'delivered' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('Card Content')}</label>
                {detailLoading ? (
                  <Skeleton className="h-24 w-full rounded-lg" />
                ) : detailError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {t('Failed to load card details')}
                  </div>
                ) : (
                  <CardContentDisplay content={cardContent} />
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                {selectedOrder?.status === 'pending' 
                  ? t('Please complete payment to view card details')
                  : t('Card details not available for this order status')}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setSelectedOrder(null)}>{t('Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
