import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 清理 CSS 变量名，替换特殊字符
 * 用于将模型名称（如 gpt-3.5-turbo）转换为有效的 CSS 变量名（gpt-3-5-turbo）
 * @param name - 原始名称
 * @returns 清理后的 CSS 变量名
 */
export function sanitizeCssVariableName(name: string): string {
  // 将点号、空格、斜杠替换为连字符
  // 移除其他不允许在 CSS 变量名中的特殊字符
  return name.replace(/[.\s/]/g, '-').replace(/[^\w-]/g, '')
}

/**
 * Generates page numbers for pagination with ellipsis
 * @param currentPage - Current page number (1-based)
 * @param totalPages - Total number of pages
 * @returns Array of page numbers and ellipsis strings
 *
 * Examples:
 * - Small dataset (≤4 pages): [1, 2, 3, 4]
 * - Near beginning: [1, 2, '...', 10]
 * - In middle: [1, '...', 5, '...', 10]
 * - Near end: [1, '...', 9, 10]
 */
export function getPageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 4
  const rangeWithDots = []

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      rangeWithDots.push(i)
    }
  } else {
    rangeWithDots.push(1)

    if (currentPage <= 2) {
      rangeWithDots.push(2)
      rangeWithDots.push('...', totalPages)
    } else if (currentPage >= totalPages - 1) {
      rangeWithDots.push('...')
      rangeWithDots.push(totalPages - 1, totalPages)
    } else {
      rangeWithDots.push('...')
      rangeWithDots.push(currentPage)
      rangeWithDots.push('...', totalPages)
    }
  }

  return rangeWithDots
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Try to parse and pretty-print JSON, fallback to original text if invalid
 * @param text - Text that might be JSON
 * @returns Pretty-printed JSON or original text
 */
/**
 * Validates that a string is a safe HTTP/HTTPS URL to redirect to.
 * When requireHttps is true, only https is allowed (http is permitted solely for
 * localhost dev), to prevent downgrade/MITM redirects on payment hand-off.
 */
export function isSafeHttpPaymentUrl(value: string, requireHttps = false): boolean {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') {
      return true
    }
    if (url.protocol === 'http:') {
      if (!requireHttps) {
        return true
      }
      // 生产严格要求 https；仅开发环境放行 localhost http（便于本地联调）。
      if (!import.meta.env.DEV) {
        return false
      }
      const host = url.hostname
      return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    }
    return false
  } catch {
    return false
  }
}

// isPrivateOrLoopbackIPv4 判断字面 IPv4 是否为环回/私网/链路本地/未指定地址。
function isPrivateOrLoopbackIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const o = m.slice(1).map(Number)
  if (o.some((n) => n > 255)) return false
  const [a, b] = o
  if (a === 0 || a === 10 || a === 127) return true // 未指定 / 私网 10/8 / 环回
  if (a === 169 && b === 254) return true // 链路本地 169.254/16
  if (a === 172 && b >= 16 && b <= 31) return true // 私网 172.16/12
  if (a === 192 && b === 168) return true // 私网 192.168/16
  return false
}

/**
 * 是否可安全地作为「公开内容里的图片」加载：必须是 https，且不指向 localhost / 环回 /
 * 私网 / 链路本地字面 IP（镜像后端 product image_url 策略）。用于防止管理员在富文本说明里
 * 嵌入 markdown/HTML 图片，借访客浏览器探测内网或追踪。
 * 局限：无法在客户端防御 DNS 解析到私网或 30x 跳转——彻底防御需服务端图片代理。
 */
export function isSafePublicImageUrl(value: string): boolean {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return false
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase() // 去 IPv6 方括号
  // 拒绝 localhost、无点主机名（含 IPv6 字面量）、以及私网/环回 IPv4。
  if (!host || host === 'localhost' || !host.includes('.')) return false
  if (isPrivateOrLoopbackIPv4(host)) return false
  return true
}

export function tryPrettyJson(text: string): string {
  const raw = (text ?? '').toString().trim()
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
