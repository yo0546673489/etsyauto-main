'use client';

import { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { productsApi, Product } from '@/lib/api';

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product: Product;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function EditProductModal({ isOpen, onClose, onSuccess, product, showToast }: EditProductModalProps) {
  const [formData, setFormData] = useState({
    title_raw: '',
    description_raw: '',
    tags_raw: [] as string[],
    images: [] as string[],
    variants: [] as any[],
    cost_usd_cents: 0 as number | undefined,
    taxonomy_id: undefined as number | undefined | null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [imagesInput, setImagesInput] = useState('');

  // Initialize form with product data when modal opens
  useEffect(() => {
    if (isOpen && product) {
      setFormData({
        title_raw: product.title_raw || '',
        description_raw: product.description_raw || '',
        tags_raw: product.tags_raw || [],
        images: product.images || [],
        variants: product.variants || [],
        cost_usd_cents: product.cost_usd_cents ?? 0,
        taxonomy_id: (product as any).taxonomy_id ?? null,
      });
      setTagsInput((product.tags_raw || []).join(', '));
      setImagesInput((product.images || []).join('\n'));
    }
  }, [isOpen, product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.title_raw.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.description_raw.trim()) {
      setError('Description is required');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Parse tags and images
      const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);
      const images = imagesInput.split('\n').map(i => i.trim()).filter(i => i);

      await productsApi.update(product.id, {
        ...formData,
        tags_raw: tags,
        images: images,
        cost_usd_cents: formData.cost_usd_cents ?? 0,
      });

      showToast('Product updated successfully!', 'success');
      handleClose();
      onSuccess();
    } catch (err: any) {
      const errorMsg = err.detail || 'Failed to update product';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--card-bg)] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary-bg)] flex items-center justify-center">
              <Package className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Edit Product</h3>
              <p className="text-sm text-[var(--text-muted)]">Update product information</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--background)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-lg text-[var(--danger)] text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Product Title *
            </label>
            <input
              type="text"
              value={formData.title_raw}
              onChange={(e) => setFormData({ ...formData, title_raw: e.target.value })}
              placeholder="e.g., Handmade Ceramic Coffee Mug"
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Description *
            </label>
            <textarea
              value={formData.description_raw}
              onChange={(e) => setFormData({ ...formData, description_raw: e.target.value })}
              placeholder="Enter product description..."
              rows={5}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Cost (optional, for COGS) */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Cost per unit (USD) <span className="text-[var(--text-muted)] font-normal">— Optional, for COGS</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
              <input
                type="number"
                value={formData.cost_usd_cents != null && formData.cost_usd_cents > 0 ? (formData.cost_usd_cents / 100).toFixed(2) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const cents = val === '' ? 0 : Math.round(parseFloat(val) * 100);
                  setFormData({ ...formData, cost_usd_cents: cents >= 0 ? cents : 0 });
                }}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={isSubmitting}
                className="w-full pl-8 pr-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Category / Taxonomy ID */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Category ID <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.taxonomy_id || ''}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  taxonomy_id: e.target.value ? parseInt(e.target.value, 10) || null : null,
                }))
              }
              placeholder="e.g. 68887478 (find on Etsy)"
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Find your category ID at{' '}
              <a
                href="https://www.etsy.com/taxonomy/json"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                etsy.com/taxonomy/json
              </a>
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., handmade, ceramic, mug, coffee"
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Image URLs (one per line)
            </label>
            <textarea
              value={imagesInput}
              onChange={(e) => setImagesInput(e.target.value)}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
              rows={4}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
            />
          </div>
        </form>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 bg-[var(--background)] border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg font-medium hover:bg-[var(--card-bg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 gradient-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Updating...' : 'Update Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

