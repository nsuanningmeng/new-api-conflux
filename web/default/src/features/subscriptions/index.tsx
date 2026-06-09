import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SectionPageLayout } from '@/components/layout'
import { SubscriptionsDialogs } from './components/subscriptions-dialogs'
import { SubscriptionsPrimaryButtons } from './components/subscriptions-primary-buttons'
import {
  SubscriptionsProvider,
  useSubscriptions,
} from './components/subscriptions-provider'
import { SubscriptionsTable } from './components/subscriptions-table'

function SubscriptionsContent() {
  const { t } = useTranslation()
  const { complianceConfirmed } = useSubscriptions()

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Subscription Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage subscription plan creation, pricing and status')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <div className='flex items-center gap-2'>
            <Alert variant='default' className='hidden px-3 py-2 sm:flex'>
              <Info className='h-4 w-4' />
              <AlertDescription className='text-xs'>
                {t(
                  'Stripe/Creem requires creating products on the third-party platform and entering the ID'
                )}
              </AlertDescription>
            </Alert>
            <SubscriptionsPrimaryButtons />
          </div>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          {!complianceConfirmed ? (
            <Alert variant='destructive' className='mb-4'>
              <AlertDescription>
                {t(
                  'Subscription plan creation and changes are locked until the administrator confirms compliance terms in Payment Gateway settings.'
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          <SubscriptionsTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <SubscriptionsDialogs />
    </>
  )
}

export function Subscriptions() {
  return (
    <SubscriptionsProvider>
      <SubscriptionsContent />
    </SubscriptionsProvider>
  )
}
