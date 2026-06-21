import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { VChart } from '@visactor/react-vchart'

type Period = 'daily' | 'weekly' | 'monthly'

interface AnalyticsData {
  total_revenue: number
  total_orders: number
  delivered_orders: number
  cancelled_orders: number
  avg_order_value: number
  top_products: Array<{
    product_id: number
    product_name: string
    order_count: number
    revenue: number
  }>
  revenue_breakdown: Array<{
    date: string
    revenue: number
    orders: number
  }>
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

export function CardShopAnalyticsSection() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('daily')

  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ['card-shop-analytics', period],
    queryFn: async () => {
      // skipBusinessError: business failures are surfaced inline by this component.
      // Without it, the global interceptor would toast the error, and combined with
      // retries + the 60s poll that produces duplicate toasts on a persistent failure.
      const res = await api.get(`/api/user/cardshop/admin/analytics?period=${period}`, {
        skipBusinessError: true,
      })
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to fetch analytics')
      return res.data.data as AnalyticsData
    },
    // Don't retry business failures (a thrown plain Error would otherwise retry ~4x).
    retry: false,
    // Each fetch runs several aggregate scans server-side; analytics need not be
    // real-time. Poll once a minute, only while the tab is visible, and treat
    // data as fresh in between so re-mounts don't refetch needlessly.
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  })

  const barSpec = useMemo(() => {
    if (!data?.revenue_breakdown?.length) return null
    return {
      type: 'bar',
      data: {
        values: data.revenue_breakdown.map((d) => ({
          date: d.date,
          // amount 存主货币单位（与 storefront 一致，无 /100）；此前 /100 使营收显示偏小 100 倍。
          revenue: d.revenue,
          orders: d.orders,
        })),
      },
      xField: 'date',
      yField: ['revenue'],
      seriesField: 'type',
      axes: [
        { orient: 'left', title: { text: t('Revenue') } },
        { orient: 'bottom', label: { rotate: 45 } },
      ],
      bar: {
        style: { fill: 'oklch(0.646 0.222 41.116)' },
      },
    }
  }, [data, t])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {t('Failed to load card shop analytics')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {p === 'daily' ? t('Card Shop Daily') : p === 'weekly' ? t('Card Shop Weekly') : t('Card Shop Monthly')}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label={t('Card Shop Analytics')}
          value={data ? `${data.total_orders}` : '0'}
          suffix={t('Card Shop Orders')}
        />
        <StatCard
          label={t('Delivered')}
          value={data ? `${data.delivered_orders}` : '0'}
        />
        <StatCard
          label={t('Card Shop Revenue')}
          value={formatLocalCurrencyAmount(data?.total_revenue ?? 0)}
        />
        <StatCard
          label={t('Avg Order')}
          value={formatLocalCurrencyAmount(data?.avg_order_value ?? 0)}
        />
      </div>

      {/* Chart */}
      {barSpec && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('Revenue Trend')}
          </h3>
          <VChart spec={barSpec} options={{ height: 300 }} />
        </div>
      )}

      {/* Top Products */}
      {data?.top_products?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('Card Shop Analytics')}
          </h3>
          <div className="space-y-2">
            {data.top_products.map((p, i) => (
              <div
                key={p.product_id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-400">{i + 1}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{p.product_name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{p.order_count} {t('orders')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatLocalCurrencyAmount(p.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
