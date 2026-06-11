import { useMemo } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'

const XAI_VIOLATION_FEE_DOC_URL =
  'https://docs.x.ai/docs/models#usage-guidelines-violation-fee'

// react-hook-form treats dots in field names as nested paths, so the schema
// must mirror that nested shape; flat dotted keys would never receive edits.
const grokSchema = z.object({
  grok: z.object({
    violation_deduction_enabled: z.boolean(),
    violation_deduction_amount: z.coerce.number().min(0),
  }),
})

type GrokFormValues = z.infer<typeof grokSchema>

type GrokFlatValues = {
  'grok.violation_deduction_enabled': boolean
  'grok.violation_deduction_amount': number
}

interface Props {
  defaultValues: GrokFlatValues
}

export function GrokSettingsCard(props: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const formDefaults = useMemo<GrokFormValues>(
    () => ({
      grok: {
        violation_deduction_enabled:
          props.defaultValues['grok.violation_deduction_enabled'],
        violation_deduction_amount:
          props.defaultValues['grok.violation_deduction_amount'],
      },
    }),
    [props.defaultValues]
  )

  const form = useForm<GrokFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(grokSchema) as any,
    defaultValues: formDefaults,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useResetForm(form as any, formDefaults)

  const onSubmit = async (data: GrokFormValues) => {
    const flattened: GrokFlatValues = {
      'grok.violation_deduction_enabled':
        data.grok.violation_deduction_enabled,
      'grok.violation_deduction_amount':
        data.grok.violation_deduction_amount,
    }
    const updates = (
      Object.keys(flattened) as Array<keyof GrokFlatValues>
    ).filter((key) => flattened[key] !== props.defaultValues[key])
    for (const key of updates) {
      await updateOption.mutateAsync({
        key,
        value: flattened[key],
      })
    }
  }

  const enabled = form.watch('grok.violation_deduction_enabled')

  return (
    <SettingsSection
      title={t('Grok Settings')}
      description={t('Configure xAI Grok model specific settings')}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <FormField
            control={form.control}
            name='grok.violation_deduction_enabled'
            render={({ field }) => (
              <FormItem className='flex items-center gap-2'>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div>
                  <FormLabel>{t('Enable violation deduction')}</FormLabel>
                  <FormDescription>
                    {t(
                      'When enabled, violation requests will incur additional charges.'
                    )}{' '}
                    <a
                      href={XAI_VIOLATION_FEE_DOC_URL}
                      target='_blank'
                      rel='noreferrer'
                      className='underline'
                    >
                      {t('Official documentation')}
                    </a>
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='grok.violation_deduction_amount'
            render={({ field }) => (
              <FormItem className='max-w-xs'>
                <FormLabel>{t('Violation deduction amount')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    step={0.01}
                    min={0}
                    {...field}
                    disabled={!enabled}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Base amount. Actual deduction = base amount × system group rate.'
                  )}
                </FormDescription>
              </FormItem>
            )}
          />

          <Button type='submit' disabled={updateOption.isPending}>
            {updateOption.isPending ? t('Saving...') : t('Save Changes')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
