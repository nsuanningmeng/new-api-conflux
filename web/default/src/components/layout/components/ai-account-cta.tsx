import { Link, useLocation } from '@tanstack/react-router'
import { ShoppingBagIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * 顶栏「AI 账号」高亮入口
 *
 * AI 账号商城是网站主打卖点，故从侧边栏提升到顶栏，并使用渐变强调样式，
 * 与普通文本导航链接形成视觉区分；位于 /card-shop 路由下时显示高亮描边。
 */
export function AiAccountCta() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const isActive = pathname.startsWith('/card-shop')

  return (
    <Button
      size='sm'
      render={<Link to='/card-shop' />}
      className={cn(
        'gap-1.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm transition-all hover:shadow-md hover:brightness-105',
        isActive && 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
      )}
    >
      <ShoppingBagIcon className='size-4' />
      <span className='hidden sm:inline'>{t('AI Account')}</span>
    </Button>
  )
}
