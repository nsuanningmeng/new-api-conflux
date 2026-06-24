import { useEffect, useState } from 'react'
import { z } from 'zod'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCwIcon,
  HistoryIcon,
  ShoppingBagIcon,
  PackageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { CardContentDisplay } from '@/features/card-shop/components/card-content-display'
import { useCardShopOrderPolling } from '@/features/card-shop/hooks/use-card-shop'
import { LAST_ORDER_STORAGE_KEY } from '@/features/card-shop/constants'

// 墙钟超时：交付通常秒级；超过此时长仍未发放则展示「稍后查看」出口，避免无限轮询。
const POLL_TIMEOUT_MS = 90_000

const searchSchema = z.object({
  // 网关回跳的 order_id 可能是字符串；coerce 成正整数，非法/缺失则忽略走 localStorage 兜底。
  order_id: z.coerce.number().int().positive().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/card-shop/success')({
  component: CardShopSuccessPage,
  validateSearch: searchSchema,
})

function resolveOrderId(searchOrderId?: number): number | undefined {
  if (searchOrderId && searchOrderId > 0) return searchOrderId
  try {
    const raw = window.localStorage.getItem(LAST_ORDER_STORAGE_KEY)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

function CardShopSuccessPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  // 进入页面时锁定一次订单 id（query 优先，localStorage 兜底）。
  const [orderId] = useState<number | undefined>(() => resolveOrderId(search.order_id))
  const [timedOut, setTimedOut] = useState(false)

  const { data, isError, refetch, isRefetching } = useCardShopOrderPolling(
    orderId ?? 0,
    !!orderId && !timedOut
  )

  const order = data?.data?.order
  const card = data?.data?.card
  const status = order?.status
  const isDelivered = status === 'delivered'
  const isCancelled = status === 'cancelled'
  // 区分两类「无可用订单数据」，避免把传输错误误判为「订单不存在」：
  //  - businessNotFound：业务层 success:false（服务器可达、订单确不存在/越权/已删除）→ 终态「未找到」。
  //  - transportError：HTTP/网络错误（500/401/断网）→ 暂时无法确认，提供刷新由轮询自愈。
  // 二者都要求 !order：react-query 在后台 refetch 失败时会保留上一次成功的 data 并仅把 isError 置 true
  // （交付后切标签页粘卡密再切回触发 focus refetch、恰逢瞬断即如此），加 !order 可避免已展示的卡密被瞬时
  // 错误抹掉；已缓存的 delivered/cancelled 终态由其各自分支继续展示。首屏加载中 order 为 undefined，但
  // isError/success 此刻均未触发，仍走处理中。
  const businessNotFound = data?.success === false && !order
  const transportError = isError && !order

  // 墙钟超时：尚未进入终态且未处于超时态时启动 90s 计时；命中即停止轮询并展示超时出口。
  // 把 timedOut 纳入依赖：手动刷新会把 timedOut 置回 false，从而重新计时一轮，
  // 避免「刷新后若仍未发放则永久轮询」（命中超时后 guard 直接返回，不会重复计时）。
  useEffect(() => {
    if (!orderId || isDelivered || isCancelled || timedOut) return
    const timer = window.setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [orderId, isDelivered, isCancelled, timedOut])

  // 交付完成后清掉兜底键，避免下次进入成功页拿到过期订单 id。
  // 仅当兜底键存的就是「当前这单」时才清：多标签/连续下单时该键是全局单值、会被后一单覆盖，
  // 无条件清会误删另一单正在用的定位兜底（其回跳若丢 query 就拿不到卡密）。
  useEffect(() => {
    if (!isDelivered || !orderId) return
    try {
      if (window.localStorage.getItem(LAST_ORDER_STORAGE_KEY) === String(orderId)) {
        window.localStorage.removeItem(LAST_ORDER_STORAGE_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [isDelivered, orderId])

  const handleManualRefresh = () => {
    setTimedOut(false)
    void refetch()
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        {/* 无法定位订单（query 与 localStorage 都没有可用 id，或后端业务层返回订单不存在/越权） */}
        {!orderId || businessNotFound ? (
          <StatusCard
            tone="error"
            icon={<XCircle className="size-9" />}
            title={t('We could not find your order')}
            description={t('Please check My Orders to view your card.')}
          >
            <OrdersAndShopActions t={t} />
          </StatusCard>
        ) : isDelivered ? (
          /* 已发放：直接展示卡密 */
          <StatusCard
            tone="success"
            icon={<CheckCircle2 className="size-9" />}
            title={t('Payment successful')}
            description={t('Your card is ready. Please copy and keep it safe.')}
          >
            <div className="space-y-4 text-left">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {order?.product_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <PackageIcon className="size-4" />
                    {order.product_name}
                  </span>
                )}
                {order?.trade_no && (
                  <span className="font-mono text-xs">{order.trade_no}</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('Your Card')}</label>
                <CardContentDisplay content={card?.card_content} />
              </div>
            </div>
            <OrdersAndShopActions t={t} />
          </StatusCard>
        ) : isCancelled ? (
          /* 订单已取消 / 支付失败。注意后端支持「迟付补发」（cancelled→delivered），
             故提供刷新出口：若用户确已付款，刷新可拉到补发后的卡密，不把已发卡订单钉死为失败。 */
          <StatusCard
            tone="error"
            icon={<XCircle className="size-9" />}
            title={t('Payment not completed')}
            description={t('This order was cancelled or the payment did not complete.')}
          >
            <p className="text-sm text-muted-foreground">
              {t('If you have already paid, refresh or check My Orders.')}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handleManualRefresh} disabled={isRefetching} variant="outline" className="gap-1.5">
                <RefreshCwIcon className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
                {t('Refresh')}
              </Button>
            </div>
            <OrdersAndShopActions t={t} />
          </StatusCard>
        ) : transportError ? (
          /* HTTP/网络错误：暂时无法确认支付状态，提供刷新（轮询仍在后台重试，网络恢复即自愈）。
             不可像 businessNotFound 那样判「订单不存在」——那会对一个可能已发卡的订单给出错误结论。 */
          <StatusCard
            tone="warning"
            icon={<AlertTriangle className="size-9" />}
            title={t('Unable to confirm payment status')}
            description={t('We could not reach the server. Please refresh to check your card.')}
          >
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handleManualRefresh} disabled={isRefetching} className="gap-1.5">
                <RefreshCwIcon className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
                {t('Refresh')}
              </Button>
              <Button variant="outline" className="gap-1.5" render={<Link to="/card-shop/orders" />}>
                <HistoryIcon className="size-4" />
                {t('View My Orders')}
              </Button>
            </div>
          </StatusCard>
        ) : timedOut ? (
          /* 超时：可能仍在处理，提供手动刷新与稍后查看出口 */
          <StatusCard
            tone="warning"
            icon={<AlertTriangle className="size-9" />}
            title={t('Delivery is taking longer than expected')}
            description={t(
              'Your payment may still be processing. You can refresh, or check My Orders later.'
            )}
          >
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handleManualRefresh} disabled={isRefetching} className="gap-1.5">
                <RefreshCwIcon className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
                {t('Refresh')}
              </Button>
              <Button variant="outline" className="gap-1.5" render={<Link to="/card-shop/orders" />}>
                <HistoryIcon className="size-4" />
                {t('View My Orders')}
              </Button>
            </div>
          </StatusCard>
        ) : (
          /* 处理中：轮询等待网关异步发卡 */
          <StatusCard
            tone="pending"
            icon={<Spinner className="size-9" />}
            title={t('Confirming your payment')}
            description={t('We are delivering your card, this usually takes just a few seconds.')}
          >
            <div className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
            </div>
          </StatusCard>
        )}
      </div>
    </div>
  )
}

type StatusTone = 'success' | 'error' | 'warning' | 'pending'

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  error: 'bg-destructive/10 text-destructive',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  pending: 'bg-primary/10 text-primary',
}

function StatusCard({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: StatusTone
  icon: React.ReactNode
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border bg-card p-6 text-center sm:p-8">
      <div className={`flex size-16 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
        {icon}
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="w-full space-y-5">{children}</div>}
    </section>
  )
}

function OrdersAndShopActions({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Button className="gap-1.5" render={<Link to="/card-shop/orders" />}>
        <HistoryIcon className="size-4" />
        {t('View My Orders')}
      </Button>
      <Button variant="outline" className="gap-1.5" render={<Link to="/card-shop" />}>
        <ShoppingBagIcon className="size-4" />
        {t('Back to Shop')}
      </Button>
    </div>
  )
}
