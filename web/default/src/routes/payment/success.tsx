import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export const Route = createFileRoute('/payment/success')({
  component: PaymentSuccess,
})

function PaymentSuccess() {
  const { t } = useTranslation()
  const [seconds, setSeconds] = useState(5)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1))
    }, 1000)
    const redirect = window.setTimeout(() => {
      window.location.assign('/console/topup')
    }, 5000)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(redirect)
    }
  }, [])

  return (
    <main className='bg-background flex min-h-dvh items-center justify-center px-4 py-10'>
      <section className='mx-auto flex w-full max-w-md flex-col items-center gap-6 text-center'>
        <div className='bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex size-16 items-center justify-center rounded-full'>
          <CheckCircle2 className='size-9' />
        </div>
        <div className='space-y-2'>
          <h1 className='text-2xl font-semibold tracking-normal'>
            {t('Payment successful')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t('Redirecting to top-up page in {{seconds}} seconds', {
              seconds,
            })}
          </p>
        </div>
        <Progress value={((5 - seconds) / 5) * 100} className='h-2 w-full' />
        <Button onClick={() => window.location.assign('/console/topup')}>
          {t('Go to top-up page')}
        </Button>
      </section>
    </main>
  )
}
