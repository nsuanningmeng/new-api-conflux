import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ClipboardIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CardContentDisplayProps {
  /** 已解密的卡密明文；为空时展示占位文案 */
  content?: string
  className?: string
}

/**
 * 卡密展示块：等宽预格式化文本 + 右上角一键复制。
 * 在「我的订单」详情与「支付成功」页之间复用，统一卡密呈现与复制（含不安全上下文降级）逻辑，
 * 避免两处各自实现剪贴板分支而行为漂移。
 */
export function CardContentDisplay({ content, className }: CardContentDisplayProps) {
  const { t } = useTranslation()

  const handleCopy = () => {
    if (!content) return
    // 不安全上下文 / 无焦点 / 权限被拒时 writeText 会缺失或 reject——必须捕获并如实反馈，
    // 不能无条件报告成功（卡密是用户唯一需要可靠拿到的值）。
    if (!navigator.clipboard?.writeText) {
      toast.error(t('Copy failed'))
      return
    }
    navigator.clipboard
      .writeText(content)
      .then(() => toast.success(t('Copied to clipboard')))
      .catch(() => toast.error(t('Copy failed')))
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <pre className="p-4 pr-12 bg-muted rounded-lg font-mono text-xs whitespace-pre-wrap break-all border overflow-auto max-h-48">
        {content || t('No content available')}
      </pre>
      <Button
        variant="secondary"
        size="icon-xs"
        aria-label={t('Copy')}
        title={t('Copy')}
        disabled={!content}
        className="absolute top-2 right-2"
        onClick={handleCopy}
      >
        <ClipboardIcon className="size-3" />
      </Button>
    </div>
  )
}
