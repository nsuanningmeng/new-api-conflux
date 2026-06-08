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
