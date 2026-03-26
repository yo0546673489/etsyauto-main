'use client';

/**
 * Post-Login Onboarding Modal
 * Collects shop name and description from new users
 */

import React, { useState } from 'react';
import { X, Store, FileText, Sparkles, CheckCircle } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (shopName: string, description: string | null) => Promise<void>;
  onSkip: () => Promise<void>;
  currentShopName?: string;
}

export default function OnboardingModal({ 
  isOpen, 
  onComplete, 
  onSkip,
  currentShopName 
}: OnboardingModalProps) {
  const [shopName, setShopName] = useState(currentShopName || '');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!shopName.trim()) {
      setError('Shop name is required');
      return;
    }

    if (shopName.trim().length < 2) {
      setError('Shop name must be at least 2 characters');
      return;
    }

    if (shopName.trim().length > 100) {
      setError('Shop name must be less than 100 characters');
      return;
    }

    if (description && description.length > 500) {
      setError('Description must be less than 500 characters');
      return;
    }

    setIsLoading(true);
    try {
      await onComplete(shopName.trim(), description.trim() || null);
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      await onSkip();
    } catch (err) {
      setError('Failed to skip. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[var(--background)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-color)] [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-[var(--primary)]/30">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Welcome! Let's Set Up Your Shop</h2>
              <p className="text-[var(--text-muted)] text-sm">This will only take a moment</p>
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="p-6 bg-[var(--background)]">
          <div className="flex items-start gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[var(--text-primary)] font-medium mb-1">Why complete your shop profile?</h3>
              <ul className="text-sm text-[var(--text-muted)] space-y-1">
                <li>• Personalize your workspace and make it your own</li>
                <li>• Help team members identify and understand your business</li>
                <li>• Get better recommendations tailored to your shop</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-lg p-4 flex items-start gap-3">
              <X className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <p className="text-[var(--danger)] text-sm">{error}</p>
            </div>
          )}

          {/* Shop Name */}
          <div>
            <label htmlFor="shopName" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Shop Name <span className="text-[var(--danger)]">*</span>
            </label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input
                id="shopName"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g., Handmade Jewelry Studio"
                className="w-full pl-11 pr-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition"
                maxLength={100}
                disabled={isLoading}
                required
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {shopName.length}/100 characters
            </p>
          </div>

          {/* Description (Optional) */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Short Description <span className="text-[var(--text-muted)] text-xs">(Optional)</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-5 h-5 text-[var(--text-muted)]" />
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us about your shop in one sentence... (e.g., 'We create unique handmade jewelry inspired by nature')"
                className="w-full pl-11 pr-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition resize-none"
                rows={3}
                maxLength={500}
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {description.length}/500 characters (recommended: ~240 chars for best display)
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isLoading || !shopName.trim()}
              className="flex-1 px-6 py-3 gradient-primary text-white font-medium rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/25"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Save & Continue
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSkip}
              disabled={isLoading}
              className="px-6 py-3 bg-[var(--background)] text-[var(--text-secondary)] font-medium rounded-lg hover:bg-[var(--border-color)] transition disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)]"
            >
              Skip for Now
            </button>
          </div>

          <p className="text-xs text-[var(--text-muted)] text-center">
            You can always update this information later from Settings
          </p>
        </form>
        </div>
      </div>
    </div>
  );
}

