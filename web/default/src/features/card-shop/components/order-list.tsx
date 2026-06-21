import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { EyeIcon, InboxIcon } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { getOrderStatusLabel, getOrderStatusBadgeClass } from '../lib'
import type { CardShopOrder } from '../types'

interface OrderListProps {
  orders: CardShopOrder[]
  onViewDetails?: (order: CardShopOrder) => void
}

export function OrderList({ orders, onViewDetails }: OrderListProps) {
  const { t } = useTranslation()
  // 仅在提供 onViewDetails 时渲染操作列：管理端「全部订单」未接详情处理器，
  // 否则会渲染一个点击无反应的死按钮（审查 #8）。
  const showActions = !!onViewDetails

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 py-16 text-muted-foreground">
        <InboxIcon className="size-10 text-muted-foreground/50" />
        <p>{t('No orders found')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Order No')}</TableHead>
            <TableHead>{t('Product Name')}</TableHead>
            <TableHead>{t('Amount')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('Time')}</TableHead>
            {showActions && <TableHead className="text-right">{t('Actions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs">{order.trade_no}</TableCell>
              <TableCell>{order.product_name}</TableCell>
              <TableCell>{formatLocalCurrencyAmount(order.money)}</TableCell>
              <TableCell>
                <Badge className={getOrderStatusBadgeClass(order.status)}>
                  {getOrderStatusLabel(order.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(order.create_time * 1000, 'yyyy-MM-dd HH:mm')}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onViewDetails?.(order)}
                    aria-label={t('View Details')}
                    title={t('View Details')}
                  >
                    <EyeIcon className="size-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
