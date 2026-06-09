import { api } from '@/lib/api'
import type { ContactResponse } from './types'

export async function getContactContent() {
  const res = await api.get<ContactResponse>('/api/contact')
  return res.data
}
