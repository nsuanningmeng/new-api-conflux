import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, TrashIcon, DownloadIcon, HistoryIcon, PackageIcon, ListIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsSection } from '../components/settings-section'
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
import type { CardShopProduct } from '../../card-shop/types'

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
      const cardList = (values.cards as string).split('\n').map((s: string) => s.trim()).filter(Boolean)
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
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteProduct(p.id)}>
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
                  onClick={() => setOrderStatus(orderStatus === s ? undefined : s)}
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
            <OrderList orders={orders} isAdmin />
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
              disabled={orders.length < DEFAULT_PAGE_SIZE}
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

function ProductDialog({ product, open, onClose, onSave, loading }: any) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    // 合并默认值：新建时 product 为 {}，需提供空白默认值，否则必填校验无法对未填字段生效。
    values: { name: '', description: '', price: 0, image_url: '', ...(product ?? {}) },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product?.id ? t('Edit Product') : t('New Product')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid gap-2">
            <Label>
              {t('Product Name')} <span className="text-destructive">*</span>
            </Label>
            <Input {...register('name', { required: t('Product name is required') as string })} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message as string}</p>}
          </div>
          <div className="grid gap-2">
            <Label>{t('Description')}</Label>
            <Textarea {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>
                {t('Price')} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="1"
                min="1"
                {...register('price', {
                  required: t('Price is required') as string,
                  valueAsNumber: true,
                  min: { value: 1, message: t('Price must be greater than 0') as string },
                })}
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message as string}</p>}
            </div>
            <div className="grid gap-2">
              <Label>{t('Image URL')}</Label>
              <Input {...register('image_url')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('Stock is derived from imported cards and cannot be edited here')}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('Cancel')}</Button>
            <Button type="submit" disabled={loading}>{loading ? t('Saving...') : t('Save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ product, open, onClose, onSave, loading }: any) {
  const { t } = useTranslation()
  const { register, handleSubmit, reset } = useForm({ defaultValues: { cards: '' } })
  // 弹窗实例不会卸载（仅靠 open 显隐），每次打开或切换商品时清空文本框，
  // 否则上次导入的卡密会残留在输入框，管理员可能误把同一批卡密重复导入两遍。
  useEffect(() => {
    if (open) reset({ cards: '' })
  }, [open, product?.id, reset])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Import Cards')}</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid gap-2">
            <Label>{t('Card Secrets')}</Label>
            <Textarea
              placeholder={t('One card per line')}
              className="min-h-64 font-mono text-xs"
              {...register('cards', { required: true })}
            />
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
                        disabled={card.status !== 'available' || deleteCard.isPending}
                        title={card.status !== 'available' ? t('Only unsold cards can be deleted') : undefined}
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
            <Button variant="outline" size="sm" disabled={cards.length < DEFAULT_PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              {t('Next')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
