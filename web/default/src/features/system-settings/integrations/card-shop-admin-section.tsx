import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, TrashIcon, DownloadIcon, HistoryIcon, PackageIcon, ListIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Dialog as FormDialog } from '@/components/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsSection } from '../components/settings-section'
import { safeNumberFieldProps } from '../utils/numeric-field'
import { SafeMarkdown } from '../../card-shop/components/safe-markdown'
import {
  useAdminCardShopProducts,
  useAdminCreateProduct,
  useAdminUpdateProduct,
  useAdminDeleteProduct,
  useAdminImportCards,
  useAdminProductCards,
  useAdminDeleteCard,
  useAdminAllOrders
} from '../../card-shop/hooks/use-card-shop'
import { OrderList } from '../../card-shop/components/order-list'
import { DEFAULT_PAGE_SIZE } from '../../card-shop/constants'
import { adminPreviewImportCards } from '../../card-shop/api'
import type { CardShopProduct, CardImportPreview } from '../../card-shop/types'

// 卡密状态 -> 展示标签 + Badge 样式。标签经 t() 翻译。
const CARD_STATUS_META: Record<string, { label: string; variant: 'secondary' | 'outline' | 'default' }> = {
  available: { label: 'Available', variant: 'secondary' },
  reserved: { label: 'Reserved', variant: 'outline' },
  sold: { label: 'Sold', variant: 'default' },
}

export function CardShopAdminSection() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('products')
  const [editingProduct, setEditingProduct] = useState<Partial<CardShopProduct> | null>(null)
  const [importingProduct, setImportingProduct] = useState<CardShopProduct | null>(null)
  const [managingProduct, setManagingProduct] = useState<CardShopProduct | null>(null)
  const [orderPage, setOrderPage] = useState(1)
  const [orderStatus, setOrderStatus] = useState<string | undefined>(undefined)

  const { data: productsData, isLoading: loadingProducts } = useAdminCardShopProducts()
  const { data: ordersData, isLoading: loadingOrders } = useAdminAllOrders(orderPage, DEFAULT_PAGE_SIZE, orderStatus)

  const createProduct = useAdminCreateProduct()
  const updateProduct = useAdminUpdateProduct()
  const deleteProduct = useAdminDeleteProduct()
  const importCards = useAdminImportCards()

  const products = productsData?.data || []
  const orders = ordersData?.data?.items || []
  const ordersTotal = ordersData?.data?.total || 0
  const orderTotalPages = Math.ceil(ordersTotal / DEFAULT_PAGE_SIZE)

  // 业务失败（success:false）的错误提示由 axios 拦截器统一弹出；这里只在确认成功后弹成功提示，
  // 避免「后端拒绝但前端误报成功」（旧 bug：商品/卡密未真正创建却提示成功）。
  const handleSaveProduct = async (values: any) => {
    try {
      const res = values.id
        ? await updateProduct.mutateAsync({ id: values.id, product: values })
        : await createProduct.mutateAsync(values)
      if (res?.success) {
        toast.success(values.id ? t('Product updated successfully') : t('Product created successfully'))
        setEditingProduct(null)
      }
    } catch {
      /* 网络/HTTP 错误已由拦截器处理 */
    }
  }

  const handleDeleteProduct = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this product?'))) return
    try {
      const res = await deleteProduct.mutateAsync(id)
      if (res?.success) toast.success(t('Product deleted successfully'))
    } catch {
      /* 由拦截器处理 */
    }
  }

  const handleImportCards = async (values: { cards: string }) => {
    if (!importingProduct) return
    try {
      // 批内去重后再提交：与导入框实时计数口径一致，也减小请求体。后端仍会再次去重并与既有
      // 库存按指纹比对（幂等兜底），故这里去重只去「批内重复」，不影响「与既有库存重复」的 skipped。
      const cardList = Array.from(new Set(
        (values.cards as string).split('\n').map((s: string) => s.trim()).filter(Boolean)
      ))
      const res = await importCards.mutateAsync({ productId: importingProduct.id, cards: cardList })
      if (res?.success) {
        const added = res.data?.count ?? 0
        const skipped = res.data?.skipped ?? 0
        // 跳过重复时给出明确计数，让管理员知道有多少卡密因重复未入库。
        toast.success(
          skipped > 0
            ? t('Imported {{added}} cards, skipped {{skipped}} duplicates', { added, skipped })
            : t('Cards imported successfully')
        )
        setImportingProduct(null)
      }
    } catch {
      /* 由拦截器处理 */
    }
  }

  return (
    <SettingsSection title={t('Card Shop Management')}>
      <p className='text-muted-foreground mb-4 text-sm'>
        {t('Manage products, card secrets and view all orders')}
      </p>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="products">
            <PackageIcon className="size-4 mr-2" />
            {t('Products')}
          </TabsTrigger>
          <TabsTrigger value="orders">
            <HistoryIcon className="size-4 mr-2" />
            {t('All Orders')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setEditingProduct({})}>
              <PlusIcon className="size-4 mr-2" />
              {t('New Product')}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Price')}</TableHead>
                  <TableHead>{t('Stock')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingProducts ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">{t('Loading...')}</TableCell></TableRow>
                ) : products.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">{t('No products')}</TableCell></TableRow>
                ) : products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.id}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.price}</TableCell>
                    <TableCell>{p.stock}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => setImportingProduct(p)}>
                        <DownloadIcon className="size-4 mr-1" />
                        {t('Import')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setManagingProduct(p)}>
                        <ListIcon className="size-4 mr-1" />
                        {t('Manage Cards')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingProduct(p)}>
                        {t('Edit')}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" aria-label={t('Delete')} title={t('Delete')} onClick={() => handleDeleteProduct(p.id)}>
                        <TrashIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              {['pending', 'paid', 'delivered', 'cancelled'].map(s => (
                <Button
                  key={s}
                  variant={orderStatus === s ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => {
                    // 切换筛选必须回到第 1 页，否则停留在旧页码会落到结果更少的状态子集的空页，
                    // 误显示「No orders found」（审查 #4）。
                    setOrderStatus(orderStatus === s ? undefined : s)
                    setOrderPage(1)
                  }}
                >
                  {t(s.charAt(0).toUpperCase() + s.slice(1))}
                </Button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Total')}: {ordersTotal}
            </div>
          </div>

          {loadingOrders ? (
            <div className="py-8 text-center text-muted-foreground">{t('Loading...')}</div>
          ) : (
            <OrderList orders={orders} />
          )}

          <div className="flex justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={orderPage <= 1}
              onClick={() => setOrderPage(p => p - 1)}
            >
              {t('Previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={orderPage >= orderTotalPages}
              onClick={() => setOrderPage(p => p + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Product Edit Dialog */}
      <ProductDialog
        product={editingProduct}
        open={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        onSave={handleSaveProduct}
        loading={createProduct.isPending || updateProduct.isPending}
      />

      {/* Import Cards Dialog */}
      <ImportDialog
        product={importingProduct}
        open={!!importingProduct}
        onClose={() => setImportingProduct(null)}
        onSave={handleImportCards}
        loading={importCards.isPending}
      />

      {/* Manage Cards Dialog */}
      <ManageCardsDialog
        product={managingProduct}
        open={!!managingProduct}
        onClose={() => setManagingProduct(null)}
      />
    </SettingsSection>
  )
}

const PRODUCT_FORM_ID = 'card-shop-product-form'

// 与同目录其它编辑弹窗（creem-product-dialog / payment-method-dialog）保持一致：
// 用 zod + zodResolver 做校验，配合共享 Form/FormField/FormItem 渲染。
const createProductDialogSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('Product name is required')),
    description: z.string(),
    price: z.number().min(1, t('Price must be greater than 0')),
    image_url: z.string(),
  })

type ProductDialogFormValues = z.infer<ReturnType<typeof createProductDialogSchema>>

type ProductDialogProps = {
  product: Partial<CardShopProduct> | null
  open: boolean
  onClose: () => void
  onSave: (values: Record<string, unknown>) => void
  loading: boolean
}

function ProductDialog({ product, open, onClose, onSave, loading }: ProductDialogProps) {
  const { t } = useTranslation()
  const isEditMode = !!product?.id

  // 对齐规范：共享 Dialog（title/footer props）+ Form/FormField + zodResolver，
  // 替换此前手写的 DialogContent/Label/Input + register 裸结构。
  const form = useForm<ProductDialogFormValues>({
    resolver: zodResolver(createProductDialogSchema(t)),
    defaultValues: { name: '', description: '', price: 0, image_url: '' },
  })

  // 弹窗实例不会卸载（仅靠 open 显隐）：每次打开或切换商品时用最新值重置，
  // 否则上次编辑的字段会残留到「新建」或另一个商品的表单。
  useEffect(() => {
    if (open) {
      form.reset({
        name: product?.name ?? '',
        description: product?.description ?? '',
        price: product?.price ?? 0,
        image_url: product?.image_url ?? '',
      })
    }
  }, [open, product, form])

  // 透传 id 以便父组件区分「新建」与「更新」；成功后由父组件关闭弹窗
  // （失败时保持打开，避免用户重填）。
  const handleSave = (values: ProductDialogFormValues) => {
    onSave(isEditMode ? { ...values, id: product?.id } : values)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o: boolean) => { if (!o) onClose() }}
      title={isEditMode ? t('Edit Product') : t('New Product')}
      contentClassName="sm:max-w-[500px]"
      contentHeight="auto"
      bodyClassName="space-y-4"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form={PRODUCT_FORM_ID} disabled={loading}>
            {loading ? t('Saving...') : t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={PRODUCT_FORM_ID}
          onSubmit={form.handleSubmit(handleSave)}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Product Name')} <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Description')}</FormLabel>
                <Tabs defaultValue="edit">
                  <TabsList>
                    <TabsTrigger value="edit">{t('Edit')}</TabsTrigger>
                    <TabsTrigger value="preview">{t('Preview')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit">
                    <FormControl>
                      <Textarea className="min-h-32 font-mono text-xs" {...field} />
                    </FormControl>
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="min-h-32 rounded-md border p-3">
                      {field.value ? (
                        <SafeMarkdown>{field.value}</SafeMarkdown>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('Nothing to preview')}</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
                <FormDescription>{t('Supports Markdown, HTML and images')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Price')} <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="1" min={1} {...safeNumberFieldProps(field)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Image URL')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {t('Stock is derived from imported cards and cannot be edited here')}
          </p>
        </form>
      </Form>
    </FormDialog>
  )
}

function ImportDialog({ product, open, onClose, onSave, loading }: any) {
  const { t } = useTranslation()
  const { register, handleSubmit, reset, watch } = useForm({ defaultValues: { cards: '' } })
  // 弹窗实例不会卸载（仅靠 open 显隐），每次打开或切换商品时清空文本框，
  // 否则上次导入的卡密会残留在输入框，管理员可能误把同一批卡密重复导入两遍。
  useEffect(() => {
    if (open) reset({ cards: '' })
  }, [open, product?.id, reset])

  // 解析卡密文本：按 \n 拆 → 去首尾空白 → 去空行 → 批内去重（Set）。拆分/去空白口径与提交时
  // handleImportCards、后端 BatchCreateCards 完全一致，故去重后的 unique 即「本批将写入的张数」。
  // 软换行（视觉折行）不含 \n、不计入，从根本上区分折行与真换行。
  // 注：仅当这些卡密未与该商品既有库存重复时，detectedCount 才与入库数完全相等；与既有库存重复的
  // 部分由后端按指纹再跳过（前端拿不到既有卡密明文，无从预判），导入后的成功提示会报 skipped。
  const cardsValue = watch('cards') || ''
  // useMemo：大批量导入时避免每次渲染都重复 split/trim/Set。
  const parsedCards = useMemo(() => {
    const lines = cardsValue.split('\n').map((s: string) => s.trim()).filter(Boolean)
    const unique = Array.from(new Set(lines))
    return { unique, dupes: lines.length - unique.length }
  }, [cardsValue])
  const detectedCount = parsedCards.unique.length

  // 服务端试算：把「将导入张数」精确到与入库数一致——含与该商品既有库存的去重（前端拿不到既有
  // 卡密明文、无法自行预判，故交由后端按指纹试算）。serverPreview 同时记录它对应的「商品 productId」
  // 与「输入文本 forValue」，仅当两者都匹配当前状态时才采用——避免切换商品（文本恰好相同）或文本
  // 变化后短暂串台/展示过期的精确值（防抖期间回退本地计数）。
  // 防抖 400ms；cancelled 闸门丢弃过期/竞态响应；任何失败（含未配 CRYPTO_SECRET、网络错误）都
  // 回退到本地批内去重计数，保证计数永不卡死 UI——试算只是把「可能更少」增强为「精确值」。
  const [serverPreview, setServerPreview] = useState<{ productId: number; forValue: string; data: CardImportPreview } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  useEffect(() => {
    if (!open || !product?.id) {
      setServerPreview(null)
      setPreviewing(false)
      return
    }
    const productId = product.id
    const lines = cardsValue.split('\n').map((s: string) => s.trim()).filter(Boolean)
    if (lines.length === 0) {
      setServerPreview(null)
      setPreviewing(false)
      return
    }
    let cancelled = false
    setPreviewing(true)
    const handle = setTimeout(() => {
      adminPreviewImportCards(productId, lines)
        .then((res) => {
          if (cancelled) return
          setServerPreview(res?.success && res.data ? { productId, forValue: cardsValue, data: res.data } : null)
        })
        .catch(() => {
          if (!cancelled) setServerPreview(null)
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [open, product?.id, cardsValue])

  // 仅当试算结果同时匹配「当前商品」与「当前文本」时才采信精确值；否则（计算中/失败/文本或商品已变）
  // 回退本地批内去重计数。
  const exactPreview =
    serverPreview && serverPreview.productId === product?.id && serverPreview.forValue === cardsValue
      ? serverPreview.data
      : null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Import Cards')}</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="card-import-textarea">{t('Card Secrets')}</Label>
            {/* wrap="off" + whitespace-pre + 横向滚动：关闭浏览器软换行，使「视觉行数 == 真实行数」，
                每行恰好一张卡，超长卡密横向滚动而非折到下一行，消除「折行被误当成多张卡」的混淆。
                w-full（基础组件已设）固定宽度，field-sizing 不会按超长内容撑宽，仅纵向随内容增高。
                aria-describedby 把下方实时张数回显关联到输入框，供读屏软件读出。 */}
            <Textarea
              id="card-import-textarea"
              aria-describedby="card-import-count"
              placeholder={t('One card per line')}
              wrap="off"
              className="min-h-64 font-mono text-xs whitespace-pre overflow-x-auto"
              {...register('cards', { required: true })}
            />
            {/* 张数回显：试算就绪时显示「将导入 N 张」（N 精确等于入库数，含与既有库存去重）；
                试算中/失败时回退「检测到 N 张」（本地批内去重计数），并在试算进行中附「核对库存中…」
                让管理员知道精确值正在计算。数字异常即说明有卡密被真实换行切开。
                role=status + aria-live=polite：计数变化以低打扰方式播报给读屏软件。 */}
            <p id="card-import-count" role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {exactPreview
                ? (exactPreview.batch_dup + exactPreview.existing_dup > 0
                    ? t('Will import {{num}} cards (excluded {{batchDup}} in-batch + {{existingDup}} already in stock)', {
                        num: exactPreview.new_count,
                        batchDup: exactPreview.batch_dup,
                        existingDup: exactPreview.existing_dup,
                      })
                    : t('Will import {{num}} cards', { num: exactPreview.new_count }))
                : (parsedCards.dupes > 0
                    ? t('Detected {{num}} cards ({{dupes}} duplicates merged)', { num: detectedCount, dupes: parsedCards.dupes })
                    : t('Detected {{num}} cards', { num: detectedCount }))}
              {!exactPreview && previewing && detectedCount > 0 && (
                <span className="ml-1 opacity-70">{t('Checking stock...')}</span>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('Cancel')}</Button>
            <Button type="submit" disabled={loading}>{loading ? t('Importing...') : t('Import')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManageCardsDialog({
  product,
  open,
  onClose,
}: {
  product: CardShopProduct | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  // 此弹窗实例不会卸载（仅靠 open 控制显隐），故每次打开或切换商品时手动重置到第 1 页，
  // 否则上次翻页后的 page 会残留，导致新商品在该页无数据时误显示「暂无卡密」。
  useEffect(() => {
    if (open) setPage(1)
  }, [open, product?.id])
  const { data, isLoading } = useAdminProductCards(product?.id ?? 0, page, DEFAULT_PAGE_SIZE, open && !!product)
  const deleteCard = useAdminDeleteCard()

  const cards = data?.data?.items || []
  const total = data?.data?.total || 0
  const cardTotalPages = Math.ceil(total / DEFAULT_PAGE_SIZE)

  const handleDeleteCard = async (cardId: number) => {
    if (!confirm(t('Are you sure you want to delete this card?'))) return
    try {
      const res = await deleteCard.mutateAsync(cardId)
      if (res?.success) toast.success(t('Card deleted successfully'))
    } catch {
      /* 由拦截器处理 */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Manage Cards')}</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border max-h-[55vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t('Card Secret')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className="text-right">{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">{t('Loading...')}</TableCell></TableRow>
              ) : cards.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">{t('No cards')}</TableCell></TableRow>
              ) : cards.map((card) => {
                const meta = CARD_STATUS_META[card.status] ?? CARD_STATUS_META.available
                return (
                  <TableRow key={card.id}>
                    <TableCell>{card.id}</TableCell>
                    <TableCell className="font-mono text-xs">{card.card_display || '—'}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{t(meta.label)}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        aria-label={t('Delete')}
                        disabled={card.status !== 'available' || deleteCard.isPending}
                        title={card.status !== 'available' ? t('Only unsold cards can be deleted') : t('Delete')}
                        onClick={() => handleDeleteCard(card.id)}
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('Total')}: {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              {t('Previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= cardTotalPages} onClick={() => setPage(p => p + 1)}>
              {t('Next')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
