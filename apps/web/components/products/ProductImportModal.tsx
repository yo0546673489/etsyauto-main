'use client';

/**
 * Product Import Modal - CSV Upload
 */

import { useState, useRef } from 'react';
import { productsApi } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { X, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export function ProductImportModal({ isOpen, onClose, onImportSuccess }: ProductImportModalProps) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        showToast('Please select a CSV file', 'error');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.csv')) {
        showToast('Please select a CSV file', 'error');
        return;
      }
      setFile(droppedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showToast('Please select a file', 'error');
      return;
    }

    try {
      setUploading(true);
      const result = await productsApi.importCsv(file);
      showToast(`Successfully imported ${result.count} products`, 'success');
      onImportSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Failed to import CSV:', error);
      showToast(error.detail || 'Failed to import CSV file', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full max-w-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)]">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              Import Products from CSV
            </h2>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-[var(--background)] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Instructions */}
            <div className="bg-[var(--background)] border border-[var(--border-color)] rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--info)] flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm text-[var(--text-primary)] font-medium">
                    CSV File Format
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Your CSV file should include the following columns:
                  </p>
                  <code className="block text-xs bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-[var(--text-primary)]">
                    sku, title, description, price, quantity
                  </code>
                  <p className="text-xs text-[var(--text-muted)]">
                    • SKU is optional but recommended for inventory tracking
                    <br />
                    • Price should be in dollars (e.g., "29.99")
                    <br />
                    • Quantity is the stock amount
                    <br />• See sample-products.csv in the project root for an example
                  </p>
                </div>
              </div>
            </div>

            {/* File Upload Area */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
                dragActive
                  ? 'border-[var(--primary)] bg-[var(--primary-bg)]'
                  : 'border-[var(--border-color)] hover:border-[var(--primary)]'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="text-center">
                {file ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-[var(--success-bg)] flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-[var(--success)]" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[var(--text-primary)] font-medium flex items-center justify-center gap-2">
                        <FileText className="w-4 h-4" />
                        {file.name}
                      </p>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setFile(null)}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-[var(--background)] flex items-center justify-center">
                        <Upload className="w-8 h-8 text-[var(--text-muted)]" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[var(--text-primary)] font-medium">
                        Drag and drop your CSV file here
                      </p>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        or click to browse
                      </p>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Select File
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--border-color)]">
            <button
              onClick={handleClose}
              className="px-6 py-2.5 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import Products
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
