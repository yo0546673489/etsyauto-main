'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useResearchWebSocket } from '@/hooks/useResearchWebSocket'
import ResearchProgress from '@/components/new-store/ResearchProgress'
import ProductList from '@/components/new-store/ProductList'
import ProductDetailModal from '@/components/new-store/ProductDetailModal'
import UploadSettings from '@/components/new-store/UploadSettings'
import { Product } from '@/types/new-store'

interface Props {
  params: { jobId: string }
}

export default function ResearchResultsPage({ params }: Props) {
  const { jobId } = params
  const { status, progress, currentStep, products, selectedNiche, errorMessage } = useResearchWebSocket(jobId)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showUploadSettings, setShowUploadSettings] = useState(false)
  const isDone = status === 'done'
  const hasProducts = products.length > 0

  return (
    <DashboardLayout>
    <div className="text-white" dir="rtl">
      <div className="max-w-6xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#006d43]">
              {isDone ? '✅ החנות מוכנה!' : 'מכין את החנות...'}
            </h1>
            {selectedNiche && (
              <p className="text-gray-400 mt-1">
                נישה: <span className="text-white font-medium">{selectedNiche.hebrew_name}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-green-400 animate-pulse' :
              status === 'disconnected' ? 'bg-yellow-400' :
              status === 'done' ? 'bg-green-400' : 'bg-gray-500'
            }`} />
            <span className="text-gray-400">
              {status === 'connected' ? 'מחובר' :
               status === 'disconnected' ? 'מתחבר מחדש...' :
               status === 'done' ? 'הושלם' : 'מתחבר...'}
            </span>
          </div>
        </div>

        {!isDone && (
          <ResearchProgress progress={progress} currentStep={currentStep} productsReady={products.length} />
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300">
            שגיאה: {errorMessage}
          </div>
        )}

        {hasProducts && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                מוצרים מוכנים
                <span className="text-[#006d43] mr-2">({products.length}/30)</span>
              </h2>
              {isDone && (
                <button
                  onClick={() => setShowUploadSettings(true)}
                  className="px-6 py-2.5 bg-[#006d43] hover:bg-[#008a54] rounded-xl font-semibold transition-colors"
                >
                  🚀 התחל העלאה אוטומטית
                </button>
              )}
            </div>
            <ProductList products={products} onProductClick={setSelectedProduct} />
          </div>
        )}

        {!hasProducts && !errorMessage && (
          <div className="mt-16 text-center text-gray-500">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-lg">{currentStep}</p>
            <p className="text-sm mt-2">המוצרים יופיעו כאן אחד אחד ברגע שיהיו מוכנים</p>
          </div>
        )}

      </div>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSave={() => setSelectedProduct(null)}
        />
      )}

      {showUploadSettings && (
        <UploadSettings
          jobId={jobId}
          productCount={products.length}
          onClose={() => setShowUploadSettings(false)}
        />
      )}
    </div>
    </DashboardLayout>
  )
}
