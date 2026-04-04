'use client'

import { useState } from 'react'

const CATEGORIES = [
  { value: '', label: '🎲 רנדומלי (מומלץ)' },
  { value: 'home decor', label: '🏠 עיצוב הבית' },
  { value: 'kitchen dining', label: '🍳 מטבח' },
  { value: 'bath beauty', label: '🛁 אמבטיה ויופי' },
  { value: 'outdoor garden', label: '🌿 גינה וחוץ' },
  { value: 'art prints', label: '🎨 אמנות' },
  { value: 'candles', label: '🕯️ נרות' },
  { value: 'desk accessories', label: '💼 אביזרי שולחן' },
  { value: 'plant pots', label: '🪴 עציצים' },
]

interface Props {
  onStart: (params: { price_min: number; price_max: number; category?: string }) => void
  loading: boolean
}

export default function StartResearchForm({ onStart, loading }: Props) {
  const [priceMin, setPriceMin] = useState(50)
  const [priceMax, setPriceMax] = useState(150)
  const [category, setCategory] = useState('')
  const [priceError, setPriceError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (priceMin >= priceMax) { setPriceError('מחיר מינימום חייב להיות קטן ממחיר מקסימום'); return }
    if (priceMin < 30) { setPriceError('מחיר מינימום לפחות 30₪'); return }
    setPriceError('')
    onStart({ price_min: priceMin, price_max: priceMax, category: category || undefined })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">טווח מחיר למוצרים (₪)</label>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">מינימום</label>
            <input type="number" value={priceMin} onChange={e => setPriceMin(Number(e.target.value))} min={30} max={500}
              className="w-full px-4 py-3 bg-[#111] border border-[#1a2e24] rounded-xl text-white focus:outline-none focus:border-[#006d43] transition-colors text-lg font-medium" />
          </div>
          <span className="text-gray-500 mt-5">—</span>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">מקסימום</label>
            <input type="number" value={priceMax} onChange={e => setPriceMax(Number(e.target.value))} min={50} max={1000}
              className="w-full px-4 py-3 bg-[#111] border border-[#1a2e24] rounded-xl text-white focus:outline-none focus:border-[#006d43] transition-colors text-lg font-medium" />
          </div>
        </div>
        {priceError && <p className="mt-2 text-red-400 text-sm">{priceError}</p>}
        <p className="mt-2 text-gray-500 text-xs">טווח מומלץ: 50-150₪ (לפי המנטור)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          קטגוריה <span className="text-gray-500 font-normal">(אופציונלי)</span>
        </label>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full px-4 py-3 bg-[#111] border border-[#1a2e24] rounded-xl text-white focus:outline-none focus:border-[#006d43] transition-colors appearance-none cursor-pointer">
          {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
        </select>
        <p className="mt-2 text-gray-500 text-xs">אם לא בחרת — המערכת תבחר קטגוריה מנצחת אוטומטית</p>
      </div>

      <button type="submit" disabled={loading}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${loading ? 'bg-[#006d43]/50 cursor-not-allowed' : 'bg-[#006d43] hover:bg-[#008a54] active:scale-[0.98]'}`}>
        {loading ? <span className="flex items-center justify-center gap-3"><span className="animate-spin">⟳</span>מתחיל מחקר...</span> : '🚀 התחל מחקר'}
      </button>
    </form>
  )
}
