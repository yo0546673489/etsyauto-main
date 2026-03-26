'use client';

/**
 * Product Detail Page - Vuexy Style
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { ArrowLeft, Package, Calendar, Tag, DollarSign, Trash2, Edit } from 'lucide-react';
import { productsApi, Product } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import { EditProductModal } from '@/components/products/EditProductModal';

function ProductDetailContent() {
  const router = useRouter();
  const params = useParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isSupplier = user?.role?.toLowerCase() === 'supplier';
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const productId = typeof params?.id === 'string' ? parseInt(params.id, 10) : null;

  useEffect(() => {
    if (productId) {
      loadProduct();
    }
  }, [productId]);

  const loadProduct = async () => {
    if (!productId) return;

    try {
      setLoading(true);
      const data = await productsApi.getById(productId);
      setProduct(data);
    } catch (error: any) {
      console.error('Failed to load product:', error);
      showToast(error.detail || 'Failed to load product', 'error');
      router.push('/products');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!productId || !confirm('Are you sure you want to delete this product?')) return;

    try {
      setDeleting(true);
      await productsApi.delete(productId);
      showToast('Product deleted successfully', 'success');
      router.push('/products');
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      showToast(error.detail || 'Failed to delete product', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-[var(--text-muted)] text-lg">Product not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/products')}
          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Products</span>
        </button>

        <div className="flex items-center gap-3">
          {!isSupplier && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--background)] transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </button>
          )}

          {!isSupplier && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 border border-[var(--danger)] text-[var(--danger)] rounded-lg hover:bg-[var(--danger-bg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? (
              <>
                <div className="w-4 h-4 border-2 border-[var(--danger)] border-t-transparent rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </>
            )}
          </button>
          )}
        </div>
      </div>

      {/* Product Title */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{product.title_raw}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Package className="w-4 h-4" />
            Product ID: {product.id}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDate(product.created_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Images */}
        <div className="lg:col-span-1">
          <DashboardCard title="Product Images">
            {product.images && product.images.length > 0 ? (
              <div className="space-y-3">
                {product.images.map((image, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border-color)]">
                    <img
                      src={image}
                      alt={`${product.title_raw} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23f0f0f0" width="400" height="400"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="16" dy="50%25" dx="50%25" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                <Package className="w-12 h-12 mb-2 opacity-50" />
                <p>No images available</p>
              </div>
            )}
          </DashboardCard>

          {/* Metadata Card */}
          <div className="mt-6">
            <DashboardCard title="Metadata">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1">Source</p>
                  <p className="text-sm text-[var(--text-primary)] font-medium capitalize">{product.source}</p>
                </div>
                {product.batch_id && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-1">Batch ID</p>
                    <p className="text-sm text-[var(--text-primary)] font-mono">{product.batch_id}</p>
                  </div>
                )}
                {product.price !== null && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-1">Price</p>
                    <p className="text-sm text-[var(--text-primary)] font-medium flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      ${(product.price / 100).toFixed(2)}
                    </p>
                  </div>
                )}
                {(product.cost_usd_cents ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-1">Cost (COGS)</p>
                    <p className="text-sm text-[var(--text-primary)] font-medium flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      ${((product.cost_usd_cents ?? 0) / 100).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </DashboardCard>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <DashboardCard title="Description">
            {product.description_raw ? (
              <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {product.description_raw}
              </p>
            ) : (
              <p className="text-[var(--text-muted)] italic">No description available</p>
            )}
          </DashboardCard>

          {/* Tags */}
          <DashboardCard title="Tags">
            {product.tags_raw && product.tags_raw.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {product.tags_raw.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--primary-bg)] text-[var(--primary)] rounded-full text-sm"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] italic">No tags available</p>
            )}
          </DashboardCard>

          {/* Variants (if available) */}
          {product.variants && Array.isArray(product.variants) && product.variants.length > 0 && (
            <DashboardCard title="Variants">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase">Variant</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase">Price</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant: any, index: number) => (
                      <tr key={index} className="border-b border-[var(--border-color)]">
                        <td className="py-3 px-4 text-sm text-[var(--text-primary)]">{variant.name || `Variant ${index + 1}`}</td>
                        <td className="py-3 px-4 text-sm text-[var(--text-primary)]">{variant.price ? `$${variant.price}` : '-'}</td>
                        <td className="py-3 px-4 text-sm text-[var(--text-primary)]">{variant.stock || '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardCard>
          )}
        </div>
      </div>

      {/* Edit Product Modal */}
      {product && (
        <EditProductModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => loadProduct()}
          product={product}
          showToast={showToast}
        />
      )}
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <DashboardLayout>
      <ProductDetailContent />
    </DashboardLayout>
  );
}
