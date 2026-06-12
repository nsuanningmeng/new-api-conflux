import { useTranslation } from 'react-i18next'
import { formatDateTimeObject } from '@/lib/time'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '@/components/dialog'

interface AnnouncementDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement: {
    title?: string
    content?: string
    tag?: string
    publishDate?: string
    extra?: string
  } | null
}

export function AnnouncementDetailModal({
  open,
  onOpenChange,
  announcement,
}: AnnouncementDetailModalProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Announcement Details')}
      description={
        announcement?.publishDate
          ? `${t('Published:')} ${formatDateTimeObject(new Date(announcement.publishDate))}`
          : undefined
      }
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <ScrollArea className='max-h-[min(58vh,520px)] pr-4'>
        <div className='space-y-4'>
          {announcement?.content && (
            <div>
              <h4 className='mb-2 font-medium'>{t('Content')}</h4>
              <Markdown>{announcement.content}</Markdown>
            </div>
          )}
          {announcement?.extra && (
            <div>
              <h4 className='mb-2 font-medium'>
                {t('Additional Information')}
              </h4>
              <Markdown className='text-muted-foreground'>
                {announcement.extra}
              </Markdown>
            </div>
          )}
        </div>
      </ScrollArea>
    </Dialog>
  )
}
