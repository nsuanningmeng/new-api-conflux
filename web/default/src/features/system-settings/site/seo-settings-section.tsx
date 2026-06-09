import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateOption } from '../hooks/use-update-option'

interface SeoDefaultValues {
  'seo_setting.title': string
  'seo_setting.description': string
  'seo_setting.keywords': string
}

export function SeoSettingsSection({
  defaultValues,
}: {
  defaultValues: SeoDefaultValues
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const [title, setTitle] = useState(defaultValues['seo_setting.title'] ?? '')
  const [description, setDescription] = useState(defaultValues['seo_setting.description'] ?? '')
  const [keywords, setKeywords] = useState(defaultValues['seo_setting.keywords'] ?? '')
  const [saved, setSaved] = useState(false)

  // C2: 记录每个字段最近一次已持久化的值，onBlur 时若未变化则跳过保存，
  // 避免无编辑的失焦反复写入、以及把未改动的值重复落库。
  const savedValuesRef = useRef<Record<string, string>>({
    'seo_setting.title': defaultValues['seo_setting.title'] ?? '',
    'seo_setting.description': defaultValues['seo_setting.description'] ?? '',
    'seo_setting.keywords': defaultValues['seo_setting.keywords'] ?? '',
  })

  useEffect(() => {
    setTitle(defaultValues['seo_setting.title'] ?? '')
    setDescription(defaultValues['seo_setting.description'] ?? '')
    setKeywords(defaultValues['seo_setting.keywords'] ?? '')
    savedValuesRef.current = {
      'seo_setting.title': defaultValues['seo_setting.title'] ?? '',
      'seo_setting.description': defaultValues['seo_setting.description'] ?? '',
      'seo_setting.keywords': defaultValues['seo_setting.keywords'] ?? '',
    }
  }, [defaultValues])

  const saveField = useCallback(
    async (key: string, value: string) => {
      // 值未发生实际变化则不提交，避免静默覆盖与冗余写入。
      if (savedValuesRef.current[key] === value) {
        return
      }
      try {
        await updateOption.mutateAsync({ key, value })
        savedValuesRef.current[key] = value
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch {
        // error handled by mutation
      }
    },
    [updateOption],
  )

  // Persist SEO settings to localStorage and apply to DOM
  useEffect(() => {
    try {
      const seo = {
        title: title || defaultValues['seo_setting.title'] || '',
        description: description || defaultValues['seo_setting.description'] || '',
        keywords: keywords || defaultValues['seo_setting.keywords'] || '',
      }
      localStorage.setItem('seo_settings', JSON.stringify(seo))
    } catch {
      /* empty */
    }
    if (title) document.title = title
    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (metaDesc && description) metaDesc.setAttribute('content', description)
    const metaKw = document.querySelector('meta[name="keywords"]') as HTMLMetaElement | null
    if (metaKw && keywords) metaKw.setAttribute('content', keywords)
  }, [title, description, keywords, defaultValues])

  return (
    <div className="space-y-4">
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {t('Saved')}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('SEO Title')}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveField('seo_setting.title', title)}
          placeholder="New API - AI Gateway"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <p className="text-xs text-gray-400">{t('Used as the browser tab title and search result heading')}</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('SEO Description')}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => saveField('seo_setting.description', description)}
          placeholder="Unified AI API gateway and admin dashboard."
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <p className="text-xs text-gray-400">{t('Brief description shown in search engine results (max 160 chars)')}</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('SEO Keywords')}
        </label>
        <input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          onBlur={() => saveField('seo_setting.keywords', keywords)}
          placeholder="AI, API, gateway, OpenAI, Claude, GPT"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <p className="text-xs text-gray-400">{t('Comma-separated keywords for search engines')}</p>
      </div>
    </div>
  )
}
