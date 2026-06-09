import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

export interface ConfluxAPISettingsValues {
  ConfluxAPIEnabled: boolean
  ConfluxAPIBaseURL: string
  ConfluxAPIAppID: string
  ConfluxAPIAppSecret: string
  ConfluxAPIMchNo: string
  ConfluxAPIGatewayNo: string
  ConfluxAPINotifyURL: string
  ConfluxAPIReturnURL: string
  ConfluxAPICancelURL: string
  ConfluxAPICurrency: string
  ConfluxAPIMinTopUp: number
}

interface Props {
  defaultValues: ConfluxAPISettingsValues
}

export function ConfluxAPISettingsSection(props: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [loading, setLoading] = useState(false)
  const form = useForm<ConfluxAPISettingsValues>({
    defaultValues: props.defaultValues,
  })

  useEffect(() => {
    form.reset(props.defaultValues)
  }, [props.defaultValues, form])

  const handleSave = async () => {
    const values = form.getValues()
    const enabled = !!values.ConfluxAPIEnabled

    if (enabled && !values.ConfluxAPIAppID.trim()) {
      toast.error(t('App ID is required'))
      return
    }

    if (enabled && !values.ConfluxAPIAppSecret.trim()) {
      toast.error(t('App Secret is required'))
      return
    }

    if (enabled && !values.ConfluxAPIMchNo.trim()) {
      toast.error(t('Merchant number is required'))
      return
    }

    if (enabled && !values.ConfluxAPIGatewayNo.trim()) {
      toast.error(t('Gateway number is required'))
      return
    }

    if (enabled && !values.ConfluxAPINotifyURL.trim()) {
      toast.error(t('Notify URL is required'))
      return
    }

    if (enabled && Number(values.ConfluxAPIMinTopUp) < 1) {
      toast.error(t('Minimum top-up amount must be at least 1'))
      return
    }

    setLoading(true)
    try {
      const options: { key: string; value: string }[] = [
        { key: 'ConfluxAPIEnabled', value: enabled ? 'true' : 'false' },
        {
          key: 'ConfluxAPIBaseURL',
          value: values.ConfluxAPIBaseURL || '',
        },
        { key: 'ConfluxAPIAppID', value: values.ConfluxAPIAppID || '' },
        { key: 'ConfluxAPIMchNo', value: values.ConfluxAPIMchNo || '' },
        {
          key: 'ConfluxAPIGatewayNo',
          value: values.ConfluxAPIGatewayNo || '',
        },
        {
          key: 'ConfluxAPINotifyURL',
          value: values.ConfluxAPINotifyURL || '',
        },
        {
          key: 'ConfluxAPIReturnURL',
          value: values.ConfluxAPIReturnURL || '',
        },
        {
          key: 'ConfluxAPICancelURL',
          value: values.ConfluxAPICancelURL || '',
        },
        {
          key: 'ConfluxAPICurrency',
          value: values.ConfluxAPICurrency || 'USD',
        },
        {
          key: 'ConfluxAPIMinTopUp',
          value: String(values.ConfluxAPIMinTopUp ?? 1),
        },
      ]

      if ((values.ConfluxAPIAppSecret || '').trim()) {
        options.push({
          key: 'ConfluxAPIAppSecret',
          value: values.ConfluxAPIAppSecret,
        })
      }

      for (const option of options) {
        await updateOption.mutateAsync(option)
      }
      toast.success(t('Updated successfully'))
    } catch {
      toast.error(t('Update failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection
      title={t('ConfluxAPI Payment Gateway')}
      description={t('Configure ConfluxAPI cross-border payment integration')}
    >
      <Alert>
        <AlertDescription className='text-xs'>
          {t(
            'Obtain App ID, App Secret, merchant number, gateway number, and configure checkout callback URLs in ConfluxAPI.'
          )}
        </AlertDescription>
      </Alert>

      <div className='grid grid-cols-2 gap-4'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.watch('ConfluxAPIEnabled')}
            onCheckedChange={(value) =>
              form.setValue('ConfluxAPIEnabled', value)
            }
          />
          <Label>{t('Enable ConfluxAPI')}</Label>
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Currency')}</Label>
          <Input placeholder='USD' {...form.register('ConfluxAPICurrency')} />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='grid gap-1.5'>
          <Label>{t('Request URL')}</Label>
          <Input
            placeholder='https://api.example.com'
            {...form.register('ConfluxAPIBaseURL')}
          />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='grid gap-1.5'>
          <Label>{t('App ID')}</Label>
          <Input placeholder='app_xxx' {...form.register('ConfluxAPIAppID')} />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('App Secret')}</Label>
          <Input
            type='password'
            placeholder={t('Leave blank unless updating')}
            {...form.register('ConfluxAPIAppSecret')}
          />
        </div>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='grid gap-1.5'>
          <Label>{t('Merchant number')}</Label>
          <Input placeholder='MCH_xxx' {...form.register('ConfluxAPIMchNo')} />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Gateway number')}</Label>
          <Input
            placeholder='GW_xxx'
            {...form.register('ConfluxAPIGatewayNo')}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Notify URL')}</Label>
          <Input
            placeholder='https://example.com/api/confluxapi/notify'
            {...form.register('ConfluxAPINotifyURL')}
          />
        </div>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='grid gap-1.5'>
          <Label>{t('Minimum top-up amount')}</Label>
          <Input
            type='number'
            min={1}
            {...form.register('ConfluxAPIMinTopUp', { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='grid gap-1.5'>
          <Label>{t('Success Redirect URL')}</Label>
          <Input
            placeholder='https://example.com/payment/success'
            {...form.register('ConfluxAPIReturnURL')}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Cancel Redirect URL')}</Label>
          <Input
            placeholder='https://example.com/console/topup'
            {...form.register('ConfluxAPICancelURL')}
          />
        </div>
      </div>

      <div className='flex justify-end'>
        <Button
          onClick={handleSave}
          disabled={loading || updateOption.isPending}
        >
          {loading || updateOption.isPending
            ? t('Saving...')
            : t('Save ConfluxAPI settings')}
        </Button>
      </div>
    </SettingsSection>
  )
}
