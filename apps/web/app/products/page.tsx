'use client';

/**
 * Products Page - Connected to Real API
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { SearchInput, PageSizeDropdown, TableActions, Pagination, TableCheckbox } from '@/components/ui/DataTable';
import { Package, Upload, Plus, Download } from 'lucide-react';
import { productsApi, type Product } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import { useShop } from '@/lib/shop-context';
import { DisconnectedShopBanner } from '@/components/ui/DisconnectedShopBanner';
import { SyncStatusModal, useRecentSync } from '@/components/modals/SyncStatusModal';
import { ProductImportModal } from '@/components/products/ProductImportModal';
import { AddProductModal } from '@/components/products/AddProductModal';
import { EditProductModal } from '@/components/products/EditProductModal';

function ProductsContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { selectedShopId, selectedShopIds } = useShop();
  const isSupplier = user?.role?.toLowerCase() === 'supplier';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  // Queue of task IDs when multiple shops are selected (Bug 1).
  const [syncTaskQueue, setSyncTaskQueue] = useState<string[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { wasSyncedRecently } = useRecentSync('products');
  const searchParams = useSearchParams();

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await productsApi.getAll(
        currentPage,
        pageSize,
        undefined,
        { shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined }
      );
      setProducts(data.products);
      setTotal(data.total);
    } catch (error: any) {
      console.error('Failed to load products:', error);
      showToast(error.detail || t('toast.loadProductsFailed'), 'error');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    await loadProducts();
  };

  // Load products
  useEffect(() => {
    loadProducts().catch(() => {});
  }, [currentPage, pageSize, selectedShopIds]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    const productId = parseInt(editId);
    if (Number.isNaN(productId)) return;
    const found = products.find((p) => p.id === productId);
    if (found) {
      setEditingProduct(found);
    } else {
      productsApi
        .getById(productId)
        .then((p) => {
          setEditingProduct(p);
        })
        .catch(() => {});
    }
  }, [searchParams, products]);

  const handleDelete = async (productId: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await productsApi.delete(productId);
      showToast(t('toast.productDeleted'), 'success');
      loadProducts();
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      showToast(error.detail || t('toast.deleteProductFailed'), 'error');
    }
  };

  const handleSyncFromCatalog = async () => {
    const CATALOG_REFRESH_KEY = 'lastRefresh_catalog';
    const REFRESH_WINDOW_MS = 60 * 1000;
    const lastRefresh = typeof window !== 'undefined' ? localStorage.getItem(CATALOG_REFRESH_KEY) : null;
    const lastRefreshTime = lastRefresh ? parseInt(lastRefresh, 10) : 0;
    if (Date.now() - lastRefreshTime < REFRESH_WINDOW_MS) {
      showToast('Synchronization is up to date', 'success');
      return;
    }
    try {
      setRefreshingCatalog(true);
      await loadProducts();
      if (typeof window !== 'undefined') localStorage.setItem(CATALOG_REFRESH_KEY, Date.now().toString());
      showToast('Products refreshed', 'success');
    } catch (error: unknown) {
      showToast((error as { detail?: string })?.detail || t('toast.loadProductsFailed'), 'error');
    } finally {
      setRefreshingCatalog(false);
    }
  };

  // Closes the sync modal and resets all sync state (Bugs 1 + 2).
  const closeSyncModal = () => {
    setShowSyncModal(false);
    setSyncTaskId(null);
    setSyncTaskQueue([]);
    setSyncing(false);
  };

  // Called by SyncStatusModal when the current task completes.
  // Advances to the next queued task or, when the queue is empty, reloads products (Bugs 1 + 2).
  const handleSyncTaskComplete = () => {
    setSyncTaskQueue((prevQueue) => {
      if (prevQueue.length === 0) {
        // All tasks done — reload and close.
        loadProducts();
        setShowSyncModal(false);
        setSyncTaskId(null);
        setSyncing(false);
        return [];
      }
      // Advance to the next task ID; keep modal open.
      const [next, ...rest] = prevQueue;
      setSyncTaskId(next);
      return rest;
    });
  };

  const handleSyncFromEtsy = async () => {
    // Resolve the full list of shops to sync (Bug 1).
    const shopList =
      selectedShopIds.length > 0
        ? selectedShopIds
        : selectedShopId != null
        ? [selectedShopId]
        : [];

    if (shopList.length === 0) {
      showToast(t('toast.connectShopFirst'), 'error');
      return;
    }
    if (wasSyncedRecently) {
      const proceed = confirm('You synced products recently. Sync again?');
      if (!proceed) return;
    }

    setSyncing(true);
    try {
      // Kick off a sync task for every selected shop in parallel (Bug 1).
      const results = await Promise.allSettled(
        shopList.map((id) => productsApi.syncFromEtsy(id))
      );

      const taskIds: string[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value?.task_id) {
          taskIds.push(res.value.task_id);
        } else if (res.status === 'rejected') {
          console.error('Failed to start sync for a shop:', res.reason);
        }
      }

      if (taskIds.length === 0) {
        // No background tasks started — show a brief toast and stop syncing.
        showToast(t('toast.syncQueued'), 'success');
        setSyncing(false);
        return;
      }

      // Open the modal for the first task; store the rest in the queue (Bug 1 + 2).
      // Leave syncing=true — it resets only when the modal is closed (Bug 2).
      const [first, ...rest] = taskIds;
      setSyncTaskId(first);
      setSyncTaskQueue(rest);
      setShowSyncModal(true);
    } catch (error: any) {
      console.error('Failed to sync from Etsy:', error);
      showToast(error.detail || t('toast.syncFailed'), 'error');
      setSyncing(false);
    }
    // NOTE: no finally block here — setSyncing(false) is deferred to closeSyncModal (Bug 2).
  };

  const handleExportProblemProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/products/export/problem-products`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `problem_products_${new Date().getTime()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      showToast('Problem products exported successfully', 'success');
    } catch (error: any) {
      console.error('Failed to export:', error);
      showToast(error.detail || 'Failed to export problem products', 'error');
    }
  };

  // Client-side search filter (shop filtering handled by backend)
  const filteredProducts = products.filter((product) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !product.title_raw.toLowerCase().includes(query) &&
        !product.description_raw?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  const toggleSelectAll = () =>
    setSelectedProducts(
      selectedProducts.length === filteredProducts.length
        ? []
        : filteredProducts.map((p) => p.id)
    );

  const toggleSelect = (id: number) =>
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full min-w-0 max-w-full mx-auto space-y-6 overflow-x-hidden">
      <DisconnectedShopBanner />

      {/* Header Stats */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('products.title')}</h2>
            <p className="text-[var(--text-muted)] mt-1">
              {t('products.subtitle')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-[var(--text-primary)]">{total}</p>
            <p className="text-sm text-[var(--text-muted)]">{t('products.total')}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <DashboardCard title={t('products.filter')} noPadding>
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 flex-wrap">
            <div className="w-full sm:w-80">
              <SearchInput
                placeholder={t('products.searchPlaceholder')}
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <PageSizeDropdown value={pageSize} onChange={setPageSize} />
              {isSupplier && (
                <button
                  onClick={handleSyncFromCatalog}
                  disabled={refreshingCatalog}
                  className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--background)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  title="Refresh products from catalog"
                >
                  <Upload className="w-4 h-4" />
                  {refreshingCatalog ? t('products.syncing') : t('products.syncEtsy')}
                </button>
              )}
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
              >
                <Upload className="w-4 h-4" />
                {t('products.importCsv')}
              </button>
              {!isSupplier && (
                <button
                  onClick={handleExportProblemProducts}
                  className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
                  title="Export products with validation issues"
                >
                  <Download className="w-4 h-4" />
                  {t('products.exportProblems')}
                </button>
              )}
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                {t('products.add')}
              </button>
            </div>
          </div>
        </div>
      </DashboardCard>

      {/* Table */}
      <DashboardCard noPadding>
        <div className="w-full overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Package className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-muted)] text-lg">{t('products.noProducts')}</p>
              <p className="text-[var(--text-muted)] text-sm mt-1">
                {searchQuery
                  ? t('products.trySearch')
                  : t('products.noProductsHint')}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  {t('products.add')}
                </button>
              )}
            </div>
          ) : (
            <>
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-32">
                      Listing ID
                    </th>
                    <th className="py-4 px-5 w-10">
                      <TableCheckbox
                        checked={selectedProducts.length === filteredProducts.length}
                        indeterminate={
                          selectedProducts.length > 0 &&
                          selectedProducts.length < filteredProducts.length
                        }
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider min-w-[260px]">
                      {t('products.table.product')}
                    </th>
                    <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-24">
                      {t('products.table.price')}
                    </th>
                    <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-24">
                      {t('products.table.cost')}
                    </th>
                    <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-20">
                      {t('products.table.images')}
                    </th>
                    <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-20">
                      צפיות
                    </th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider w-28">
                      {t('products.table.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--background)] transition-colors"
                    >
                      <td className="py-4 px-5 text-right text-sm font-mono text-[#006d43] font-semibold whitespace-nowrap">
                        {product.etsy_listing_id ?? '—'}
                      </td>
                      <td className="py-4 px-5">
                        <TableCheckbox
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleSelect(product.id)}
                        />
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--background)] flex items-center justify-center overflow-hidden">
                            {product.images && product.images.length > 0 ? (
                              <img
                                src={product.images[0]}
                                alt={product.title_raw}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-[var(--text-muted)]" />
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-medium text-[var(--text-primary)] truncate max-w-[220px]">
                              {product.title_raw || 'Untitled Product'}
                            </p>
                            <p className="text-sm text-[var(--text-muted)] truncate max-w-[220px]">
                              {product.description_raw || 'No description'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right text-[var(--text-primary)] font-medium whitespace-nowrap">
                        {product.price ? `$${(product.price / 100).toFixed(2)}` : '-'}
                      </td>
                      <td className="py-4 px-5 text-right text-[var(--text-primary)] font-medium whitespace-nowrap">
                        {(product.cost_usd_cents ?? 0) > 0 ? `$${((product.cost_usd_cents ?? 0) / 100).toFixed(2)}` : '-'}
                      </td>
                      <td className="py-4 px-5 text-right text-[var(--text-primary)]">
                        {product.images?.length || 0}
                      </td>
                      <td className="py-4 px-5 text-right text-[var(--text-primary)] font-medium">
                        {(product.views ?? 0) > 0
                          ? (product.views! >= 1000
                              ? `${(product.views! / 1000).toFixed(1)}k`
                              : product.views)
                          : '—'}
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <TableActions
                            onView={() => router.push(`/products/${product.id}`)}
                            onEdit={!isSupplier ? () => setEditingProduct(product) : undefined}
                            onDelete={!isSupplier ? () => handleDelete(product.id) : undefined}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      </DashboardCard>

      {/* Import Modal */}
      <ProductImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={() => {
          loadProducts();
          setCurrentPage(1);
        }}
      />

      {/* Add Product Modal */}
      <AddProductModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onProductAdded={() => {
          loadProducts();
          setCurrentPage(1);
        }}
      />

      {editingProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <EditProductModal
            isOpen={!!editingProduct}
            onClose={() => setEditingProduct(null)}
            product={editingProduct}
            onSuccess={() => {
              setEditingProduct(null);
              fetchProducts();
            }}
            showToast={showToast}
          />
        </div>
      )}

      <SyncStatusModal
        isOpen={showSyncModal}
        onClose={closeSyncModal}
        taskId={syncTaskId}
        syncType="products"
        onComplete={handleSyncTaskComplete}
      />

    </div>
  );
}

export default function ProductsPage() {
  return <DashboardLayout><ProductsContent /></DashboardLayout>;
}
