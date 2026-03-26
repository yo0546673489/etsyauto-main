'use client';

/**
 * Add Product Modal - Single Product Entry
 */

import { useState } from 'react';
import { productsApi } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { X, Plus, Package } from 'lucide-react';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded: () => void;
}

export function AddProductModal({ isOpen, onClose, onProductAdded }: AddProductModalProps) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    title: '',
    description: '',
    price: '',
    quantity: '',
    cost: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.title.trim()) {
      showToast('Product title is required', 'error');
      return;
    }

    try {
      setSubmitting(true);

      // Convert price to cents (backend expects price in cents)
      const priceInCents = formData.price ? Math.round(parseFloat(formData.price) * 100) : null;
      // Convert cost to cents (backend expects cost_usd_cents)
      const costInCents = formData.cost ? Math.round(parseFloat(formData.cost) * 100) : 0;

      // Prepare data for backend
      const productData = {
        title_raw: formData.title,
        description_raw: formData.description || null,
        tags_raw: formData.sku ? [`SKU:${formData.sku}`] : [],
        images: [],
        variants: formData.quantity
          ? {
              quantity: parseInt(formData.quantity) || 0,
            }
          : null,
        price: priceInCents,
        quantity: formData.quantity ? parseInt(formData.quantity) || null : null,
        cost_usd_cents: costInCents >= 0 ? costInCents : 0,
      };

      // Note: Backend ProductImportRequest doesn't have price field directly
      // We'll need to use a workaround or update the backend schema
      // For now, we'll send it and the backend can ignore it if not supported
      await productsApi.importSingle(productData);

      showToast('Product added successfully', 'success');
      onProductAdded();
      handleClose();
    } catch (error: any) {
      console.error('Failed to add product:', error);
      showToast(error.detail || 'Failed to add product', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      sku: '',
      title: '',
      description: '',
      price: '',
      quantity: '',
      cost: '',
    });
    setSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full max-w-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--primary-bg)] flex items-center justify-center">
                <Package className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Add New Product</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-[var(--background)] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-5">
              {/* SKU */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  SKU <span className="text-[var(--text-muted)]">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="e.g., TSHIRT-001"
                  className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Product Title <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="e.g., Vintage Style Cotton T-Shirt"
                  required
                  className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Description <span className="text-[var(--text-muted)]">(Optional)</span>
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Enter product description..."
                  className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none"
                />
              </div>

              {/* Price, Cost, and Quantity */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Price (USD) <span className="text-[var(--text-muted)]">(Optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                      $
                    </span>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      placeholder="29.99"
                      className="w-full pl-8 pr-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Cost (USD) <span className="text-[var(--text-muted)]">(Optional, for COGS)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                      $
                    </span>
                    <input
                      type="number"
                      name="cost"
                      value={formData.cost}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Quantity <span className="text-[var(--text-muted)]">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    min="0"
                    placeholder="50"
                    className="w-full px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-[var(--background)] border border-[var(--border-color)] rounded-lg p-4">
                <p className="text-sm text-[var(--text-muted)]">
                  <strong className="text-[var(--text-primary)]">Note:</strong> After adding the
                  product, you can edit it to add images, tags, and other details.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2.5 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formData.title.trim()}
                className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Product
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
