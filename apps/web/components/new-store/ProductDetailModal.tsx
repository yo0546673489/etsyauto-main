'use client'

import { useState } from 'react'
import { Product } from '@/types/new-store'

interface Props {
  product: Product
  onClose: () => void
  onSave: (updated: Product) => void
}

export default function ProductDetailModal({ product, onClose, onSave }: Props) {
  const [activeImage, setActiveImage] = useState(0)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)
  const [editingTags, setEditingTags] = useState(false)

  const [title, setTitle] = useState(product.title)
  const [description, setDescription] = useState(product.description)
  const [price, setPrice] = useState(product.price)
  const [tags, setTags] = useState<string[]>(product.tags)
  const [tagsInput, setTagsInput] = useState(product.tags.join(', '))

  function handleSave() {
    const updatedTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    onSave({ ...product, title, description, price, tags: updatedTags })
  }

  function handleTagsBlur() {
    const updated = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    setTags(updated)
    setEditingTags(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#0d1a12] border border-[#1a2e24] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2e24]">
          <h2 className="text-lg font-semibold text-white">פרטי מוצר</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row gap-0">

            {/* Image Gallery */}
            <div className="md:w-2/5 p-6 border-b md:border-b-0 md:border-l border-[#1a2e24]">
              <div className="aspect-square rounded-xl overflow-hidden bg-[#0a0f0d] mb-3">
                {product.images[activeImage] ? (
                  <img
                    src={product.images[activeImage]}
                    alt={title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-5xl">🖼️</div>
                )}
              </div>
              {product.images.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(i)}
                      className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        activeImage === i ? 'border-[#006d43]' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 text-xs text-gray-500 text-center">
                {product.images.length} תמונות • נישה: {product.source_niche}
              </div>
            </div>

            {/* Details */}
            <div className="md:w-3/5 p-6 space-y-5">

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500 font-medium">כותרת</label>
                  <button onClick={() => setEditingTitle(!editingTitle)} className="text-xs text-[#006d43] hover:underline">
                    {editingTitle ? 'סגור' : 'ערוך'}
                  </button>
                </div>
                {editingTitle ? (
                  <textarea
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-[#0a0f0d] border border-[#006d43] rounded-lg text-white text-sm focus:outline-none resize-none"
                  />
                ) : (
                  <p className="text-white text-sm leading-relaxed">{title}</p>
                )}
                <p className="text-xs text-gray-600 mt-1">{title.length}/140 תווים</p>
              </div>

              {/* Price */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500 font-medium">מחיר</label>
                  <button onClick={() => setEditingPrice(!editingPrice)} className="text-xs text-[#006d43] hover:underline">
                    {editingPrice ? 'סגור' : 'ערוך'}
                  </button>
                </div>
                {editingPrice ? (
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(Number(e.target.value))}
                    min={1}
                    className="w-32 px-3 py-2 bg-[#0a0f0d] border border-[#006d43] rounded-lg text-white text-sm focus:outline-none"
                  />
                ) : (
                  <p className="text-[#006d43] text-xl font-bold" dir="ltr">₪{price}</p>
                )}
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500 font-medium">תגיות ({tags.length}/13)</label>
                  <button onClick={() => setEditingTags(!editingTags)} className="text-xs text-[#006d43] hover:underline">
                    {editingTags ? 'סגור' : 'ערוך'}
                  </button>
                </div>
                {editingTags ? (
                  <textarea
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    onBlur={handleTagsBlur}
                    rows={3}
                    placeholder="תג1, תג2, תג3..."
                    className="w-full px-3 py-2 bg-[#0a0f0d] border border-[#006d43] rounded-lg text-white text-sm focus:outline-none resize-none"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 bg-[#0a0f0d] border border-[#1a2e24] rounded-full text-gray-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500 font-medium">תיאור</label>
                  <button onClick={() => setEditingDescription(!editingDescription)} className="text-xs text-[#006d43] hover:underline">
                    {editingDescription ? 'סגור' : 'ערוך'}
                  </button>
                </div>
                {editingDescription ? (
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 bg-[#0a0f0d] border border-[#006d43] rounded-lg text-white text-sm focus:outline-none resize-none"
                  />
                ) : (
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{description}</p>
                )}
                <p className="text-xs text-gray-600 mt-1">{description.length} תווים</p>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1a2e24] bg-[#0a0f0d]">
          <button onClick={onClose} className="px-5 py-2 text-gray-400 hover:text-white transition-colors text-sm">
            סגור
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-[#006d43] hover:bg-[#008a54] rounded-xl text-white font-semibold text-sm transition-colors"
          >
            שמור שינויים
          </button>
        </div>
      </div>
    </div>
  )
}
