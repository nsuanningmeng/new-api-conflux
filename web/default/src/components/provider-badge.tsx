import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { StatusBadge, type StatusBadgeProps } from './status-badge'

type ProviderBadgeProps = Omit<StatusBadgeProps, 'children' | 'label'> & {
  iconKey?: string | null
  iconSize?: number
  label: string
}

export function ProviderBadge({
  className,
  iconKey,
  iconSize = 14,
  label,
  ...badgeProps
}: ProviderBadgeProps) {
  const icon = iconKey ? getLobeIcon(iconKey, iconSize) : null

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {icon}
      <StatusBadge label={label} autoColor={label} size='sm' {...badgeProps} />
    </div>
  )
}
