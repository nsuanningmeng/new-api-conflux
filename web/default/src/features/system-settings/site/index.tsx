import { SettingsPage } from '../components/settings-page'
import type { SiteSettings } from '../types'
import {
  SITE_DEFAULT_SECTION,
  getSiteSectionContent,
} from './section-registry.tsx'

const defaultSiteSettings: SiteSettings = {
  'theme.frontend': 'default',
  Notice: '',
  SystemName: 'New API',
  Logo: '',
  Footer: '',
  About: '',
  Contact: '',
  HomePageContent: '',
  ServerAddress: '',
  'legal.user_agreement': '',
  'legal.privacy_policy': '',
  'legal.refund_policy': '',
  HeaderNavModules: '',
  SidebarModulesAdmin: '',
  'seo_setting.title': '',
  'seo_setting.description': '',
  'seo_setting.keywords': '',
}

export function SiteSettings() {
  return (
    <SettingsPage
      routePath='/_authenticated/system-settings/site/$section'
      defaultSettings={defaultSiteSettings}
      defaultSection={SITE_DEFAULT_SECTION}
      getSectionContent={getSiteSectionContent}
    />
  )
}
