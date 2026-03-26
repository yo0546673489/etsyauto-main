"use client";

import { useState, useEffect } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle, Download, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { useShop } from '@/lib/shop-context';

// Helper function for API requests
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw error;
  }
  
  return await response.json();
}

interface IngestionBatch {
  id: number;
  batch_id: string;
  filename: string;
  file_type: string;
  status: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  created_at: string;
  completed_at: string | null;
}

interface BatchStatus {
  batch_id: string;
  status: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  progress_percent: number;
  error_report_url: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export default function ProductIngestionPage() {
  const [batches, setBatches] = useState<IngestionBatch[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const { selectedShopId, selectedShop } = useShop();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBatches();
    const interval = setInterval(loadBatches, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [selectedShopId]);

  const loadBatches = async () => {
    try {
      const params = selectedShopId ? `?shop_id=${selectedShopId}` : "";
      const response = await apiRequest<{ batches: IngestionBatch[] }>(`/products/ingestion/batch${params}`);
      setBatches(response.batches || []);
    } catch (error) {
      console.error("Failed to load batches:", error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ["text/csv", "application/json", "text/json"];
      const validExtensions = [".csv", ".json"];
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

      if (
        !validTypes.includes(file.type) &&
        !validExtensions.includes(fileExtension)
      ) {
        setUploadError("Please select a CSV or JSON file");
        return;
      }

      setUploadedFile(file);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadedFile) {
      setUploadError("Please select a file to upload");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const fileType = uploadedFile.name.endsWith(".json") ? "json" : "csv";
      const endpoint = `/products/ingestion/upload/${fileType}${
        selectedShopId ? `?shop_id=${selectedShopId}` : ""
      }`;

      const response = await apiRequest<{ batch_id: string; message: string }>(endpoint, {
        method: "POST",
        body: formData,
      });

      // Success
      setUploadedFile(null);
      await loadBatches();

      // Optionally, show batch status
      if (response.batch_id) {
        setSelectedBatchId(response.batch_id);
        loadBatchStatus(response.batch_id);
      }
    } catch (error: any) {
      setUploadError(
        error.response?.data?.detail || "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  const loadBatchStatus = async (batchId: string) => {
    try {
      const status = await apiRequest<BatchStatus>(`/products/ingestion/batch/${batchId}/status`);
      setBatchStatus(status);
    } catch (error) {
      console.error("Failed to load batch status:", error);
    }
  };

  const handleViewBatch = async (batchId: string) => {
    setSelectedBatchId(batchId);
    setLoading(true);
    await loadBatchStatus(batchId);
    setLoading(false);
  };

  const handleDownloadErrors = (batchId: string, format: string = "csv") => {
    const url = `${API_BASE_URL}/api/products/ingestion/errors/${batchId}?format=${format}`;
    window.open(url, "_blank");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "processing":
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Product Ingestion</h1>
        <p className="text-gray-600 mt-2">
          Upload CSV or JSON files to import products in bulk
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Upload Products</h2>

        <div className="space-y-4">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File
            </label>
            <div className="flex items-center space-x-4">
              <label className="flex-1 flex items-center justify-center px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition cursor-pointer">
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">
                    {uploadedFile ? uploadedFile.name : "Click to select CSV or JSON file"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Supported: CSV, JSON (Max 10MB)
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.json"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          {/* Current Shop */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Shop
            </label>
            <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
              {selectedShop ? (selectedShop.display_name || `Shop ${selectedShop.id}`) : 'No shop selected'}
            </div>
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{uploadError}</p>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!uploadedFile || uploading}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Upload & Process
              </>
            )}
          </button>
        </div>
      </div>

      {/* Batch Status Detail (if selected) */}
      {selectedBatchId && batchStatus && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Batch Details</h2>
            <button
              onClick={() => loadBatchStatus(selectedBatchId)}
              className="p-2 text-gray-600 hover:text-blue-600 transition"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {getStatusIcon(batchStatus.status)}
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(batchStatus.status)}`}>
                {batchStatus.status.toUpperCase()}
              </span>
            </div>

            {/* Progress Bar */}
            {batchStatus.total_rows > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round(batchStatus.progress_percent)}%</span>
                </div>
                <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${batchStatus.progress_percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{batchStatus.total_rows}</p>
                <p className="text-sm text-gray-600">Total Rows</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{batchStatus.successful_rows}</p>
                <p className="text-sm text-gray-600">Successful</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{batchStatus.failed_rows}</p>
                <p className="text-sm text-gray-600">Failed</p>
              </div>
            </div>

            {/* Error Report Download */}
            {batchStatus.failed_rows > 0 && batchStatus.error_report_url && (
              <button
                onClick={() => handleDownloadErrors(selectedBatchId)}
                className="w-full px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition flex items-center justify-center"
              >
                <Download className="w-5 h-5 mr-2" />
                Download Error Report
              </button>
            )}

            {/* Error Message */}
            {batchStatus.error_message && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{batchStatus.error_message}</p>
              </div>
            )}

            {/* Timestamps */}
            <div className="text-xs text-gray-500 space-y-1">
              <p>Created: {new Date(batchStatus.created_at).toLocaleString()}</p>
              {batchStatus.started_at && (
                <p>Started: {new Date(batchStatus.started_at).toLocaleString()}</p>
              )}
              {batchStatus.completed_at && (
                <p>Completed: {new Date(batchStatus.completed_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch History */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Ingestion History</h2>
          <button
            onClick={loadBatches}
            className="p-2 text-gray-600 hover:text-blue-600 transition"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {batches.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No ingestion batches yet</p>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => (
              <div
                key={batch.batch_id}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 transition cursor-pointer"
                onClick={() => handleViewBatch(batch.batch_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(batch.status)}
                    <div>
                      <p className="font-medium text-gray-900">{batch.filename}</p>
                      <p className="text-sm text-gray-500">
                        {batch.file_type.toUpperCase()} • {batch.total_rows} rows
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(batch.status)}`}>
                      {batch.status}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(batch.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Mini Stats */}
                {batch.total_rows > 0 && (
                  <div className="mt-3 flex items-center space-x-4 text-sm">
                    <span className="text-green-600">
                      ✓ {batch.successful_rows} success
                    </span>
                    {batch.failed_rows > 0 && (
                      <span className="text-red-600">
                        ✗ {batch.failed_rows} failed
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">File Format Help</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p><strong>CSV Format:</strong> Headers should include: title, sku, description, price, quantity, tags, images</p>
          <p><strong>JSON Format:</strong> Array of objects or object with "products" key</p>
          <p><strong>Required:</strong> title (max 140 chars)</p>
          <p><strong>Optional:</strong> sku, description, price, quantity, tags (max 13), images (max 10 URLs)</p>
          <p><strong>Tags/Images:</strong> Separate multiple values with pipes (|), commas, or semicolons</p>
        </div>
      </div>
    </div>
  );
}

