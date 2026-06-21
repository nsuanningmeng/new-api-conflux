import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { cn, isSafePublicImageUrl } from '@/lib/utils'

// 卡商城商品说明由管理员撰写、在公开 storefront 对全体登录用户渲染。共享的 <Markdown>
// 用 rehype-raw 渲染原始 HTML 但不做净化，存在 XSS 面；此处提供「商城专用」的净化版本
// （方案 S3）：保留 Markdown + 格式化 HTML + 图片/表格，剥离 <script>、事件属性（onerror 等）、
// 以及 javascript:/data: 等危险协议，绝不影响其它 8 处现有 <Markdown> 用法。
//
// 净化在 rehype-raw 之后执行：先把原始 HTML 字符串解析进 hast，再由 rehype-sanitize 清洗整棵树。
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // 允许图片携带 loading/referrerPolicy（实际值由下方自定义 img 组件强制注入，这里仅放行属性键）。
    img: [...(defaultSchema.attributes?.img ?? []), 'loading', 'referrerPolicy'],
  },
  protocols: {
    ...defaultSchema.protocols,
    // 图片 src 仅允许 https，剥离 http（含 http://内网）/ data: 等；private IP 由下方 img 组件二次拦截。
    src: ['https'],
  },
}

interface SafeMarkdownProps {
  children: string
  className?: string
}

export function SafeMarkdown({ children, className }: SafeMarkdownProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
        'prose-p:leading-relaxed prose-p:my-2',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted prose-pre:border',
        'prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1',
        'prose-ul:my-2 prose-ol:my-2 prose-li:my-1',
        'prose-table:border prose-thead:bg-muted',
        'prose-td:border prose-th:border prose-td:px-3 prose-th:px-3',
        'prose-img:rounded-lg prose-img:shadow-sm',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[overflow-wrap:anywhere] break-words',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target='_blank' rel='noopener noreferrer nofollow' />
          ),
          // 二次校验 markdown 图片地址：仅渲染 https 公网图片，拒绝 localhost/私网字面 IP，
          // 与后端 image_url 策略一致；外链图片强制 lazy + no-referrer（避免访客 IP 追踪/混合内容）。
          img: ({ node, src, ...props }) => {
            if (typeof src !== 'string' || !isSafePublicImageUrl(src)) {
              return null
            }
            return <img {...props} src={src} loading='lazy' referrerPolicy='no-referrer' />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
