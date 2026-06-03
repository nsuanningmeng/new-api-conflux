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
import { format } from 'date-fns'
import { EyeIcon } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { getOrderStatusLabel, getOrderStatusColor } from '../lib'
import type { CardShopOrder } from '../types'

interface OrderListProps {
  orders: CardShopOrder[]
  onViewDetails?: (order: CardShopOrder) => void
  isAdmin?: boolean
}

export function OrderList({ orders, onViewDetails, isAdmin }: OrderListProps) {
  const { t } = useTranslation()

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>{t('No orders found')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Order No')}</TableHead>
            <TableHead>{t('Product Name')}</TableHead>
            <TableHead>{t('Amount')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('Time')}</TableHead>
            <TableHead className="text-right">{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs">{order.trade_no}</TableCell>
              <TableCell>{order.product_name}</TableCell>
              <TableCell>{formatLocalCurrencyAmount(order.money)}</TableCell>
              <TableCell>
                <Badge variant={getOrderStatusColor(order.status) as any}>
                  {getOrderStatusLabel(order.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(order.create_time * 1000, 'yyyy-MM-dd HH:mm')}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onViewDetails?.(order)}
                  title={t('View Details')}
                >
                  <EyeIcon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
