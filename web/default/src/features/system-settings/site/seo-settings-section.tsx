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
import { useState, useEffect, useCallback } from 'react'
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

  useEffect(() => {
    setTitle(defaultValues['seo_setting.title'] ?? '')
    setDescription(defaultValues['seo_setting.description'] ?? '')
    setKeywords(defaultValues['seo_setting.keywords'] ?? '')
  }, [defaultValues])

  const saveField = useCallback(
    async (key: string, value: string) => {
      try {
        await updateOption.mutateAsync({ key, value })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch {
        // error handled by mutation
      }
    },
    [updateOption],
  )

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
