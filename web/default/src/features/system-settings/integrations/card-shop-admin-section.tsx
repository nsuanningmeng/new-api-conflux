import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, TrashIcon, DownloadIcon, HistoryIcon, PackageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  useAdminAllOrders
} from '../../card-shop/hooks/use-card-shop'
import { OrderList } from '../../card-shop/components/order-list'
import { DEFAULT_PAGE_SIZE } from '../../card-shop/constants'
import type { CardShopProduct } from '../../card-shop/types'

export function CardShopAdminSection() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('products')
  const [editingProduct, setEditingProduct] = useState<Partial<CardShopProduct> | null>(null)
  const [importingProduct, setImportingProduct] = useState<CardShopProduct | null>(null)
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

  const handleSaveProduct = async (values: any) => {
    try {
      if (values.id) {
        await updateProduct.mutateAsync({ id: values.id, product: values })
        toast.success(t('Product updated successfully'))
      } else {
        await createProduct.mutateAsync(values)
        toast.success(t('Product created successfully'))
      }
      setEditingProduct(null)
    } catch (err: any) {
      toast.error(err.message || t('Operation failed'))
    }
  }

  const handleDeleteProduct = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this product?'))) return
    try {
      await deleteProduct.mutateAsync(id)
      toast.success(t('Product deleted successfully'))
    } catch (err: any) {
      toast.error(err.message || t('Delete failed'))
    }
  }

  const handleImportCards = async (values: { cards: string }) => {
    if (!importingProduct) return
    try {
      const cardList = (values.cards as string).split('\n').map((s: string) => s.trim()).filter(Boolean)
      await importCards.mutateAsync({ productId: importingProduct.id, cards: cardList })
      toast.success(t('Cards imported successfully'))
      setImportingProduct(null)
    } catch (err: any) {
      toast.error(err.message || t('Import failed'))
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
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => setImportingProduct(p)}>
                        <DownloadIcon className="size-4 mr-1" />
                        {t('Import')}
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
          
          <OrderList orders={orders} isAdmin />
          
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
    </SettingsSection>
  )
}

function ProductDialog({ product, open, onClose, onSave, loading }: any) {
  const { t } = useTranslation()
  const { register, handleSubmit, reset } = useForm({
    values: product || { name: '', description: '', price: 0, image_url: '', stock: 0 }
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product?.id ? t('Edit Product') : t('New Product')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid gap-2">
            <Label>{t('Product Name')}</Label>
            <Input {...register('name', { required: true })} />
          </div>
          <div className="grid gap-2">
            <Label>{t('Description')}</Label>
            <Textarea {...register('description')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>{t('Price')}</Label>
              <Input type="number" step="0.01" {...register('price', { valueAsNumber: true })} />
            </div>
            <div className="grid gap-2">
              <Label>{t('Image URL')}</Label>
              <Input {...register('image_url')} />
            </div>
          </div>
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
  const { register, handleSubmit } = useForm()

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
