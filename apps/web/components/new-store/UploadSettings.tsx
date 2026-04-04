'use client'

import { useState } from 'react'

interface Props {
  jobId: string
  productCount: number
  onClose: () => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function UploadSettings({ jobId, productCount, onClose }: Props) {
  const [productsPerDay, setProductsPerDay] = useState<1 | 2>(2)
  const [uploadHour, setUploadHour] = useState(9)
  const [randomOffset, setRandomOffset] = useState(30)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const daysNeeded = Math.ceil(productCount / productsPerDay)

  async function handleStart() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stores/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          products_per_day: productsPerDay,
          upload_hour: uploadHour,
          random_offset_minutes: randomOffset
        })
      })
      if (!res.ok) throw new Error('שגיאה בהגדרת לוח הזמנים')
      setSuccess(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#0d1a12] border border-[#1a2e24] rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2e24]">
          <h2 className="text-lg font-semibold text-white">הגדרות העלאה אוטומטית</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-white mb-2">לוח הזמנים נוצר!</h3>
            <p className="text-gray-400 mb-2">
              {productCount} מוצרים יועלו ב-{daysNeeded} ימים
            </p>
            <p className="text-gray-500 text-sm">
              {productsPerDay} מוצרים ביום בשעה {String(uploadHour).padStart(2, '0')}:00
            </p>
            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-[#006d43] hover:bg-[#008a54] rounded-xl font-semibold transition-colors">
              סגור
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">

            {/* Products per day */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">כמה מוצרים ביום?</label>
              <div className="grid grid-cols-2 gap-3">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setProductsPerDay(n)}
                    className={`py-3 rounded-xl border-2 font-medium transition-all ${
                      productsPerDay === n
                        ? 'border-[#006d43] bg-[#006d43]/20 text-white'
                        : 'border-[#1a2e24] text-gray-400 hover:border-[#006d43]/50'
                    }`}
                  >
                    {n} מוצר{n === 1 ? '' : 'ים'} ביום
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {productCount} מוצרים ÷ {productsPerDay}/יום = {daysNeeded} ימים
              </p>
            </div>

            {/* Upload hour */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">שעת העלאה</label>
              <select
                value={uploadHour}
                onChange={e => setUploadHour(Number(e.target.value))}
                className="w-full px-4 py-3 bg-[#0a0f0d] border border-[#1a2e24] rounded-xl text-white focus:outline-none focus:border-[#006d43] transition-colors"
              >
                {HOURS.map(h => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>

            {/* Random offset */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">רעש אקראי</label>
                <span className="text-[#006d43] font-medium text-sm">±{randomOffset} דקות</span>
              </div>
              <input
                type="range"
                min={0}
                max={120}
                step={5}
                value={randomOffset}
                onChange={e => setRandomOffset(Number(e.target.value))}
                className="w-full accent-[#006d43]"
              />
              <p className="mt-1 text-xs text-gray-500">
                המוצר יועלה בין {String(uploadHour).padStart(2, '0')}:{String(Math.max(0, 0 - randomOffset)).padStart(2, '0')} לבין {String(uploadHour).padStart(2, '0')}:{String(Math.min(59, randomOffset)).padStart(2, '0')} (כדי להיראות טבעי)
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Summary */}
            <div className="p-4 bg-[#0a0f0d] rounded-xl border border-[#1a2e24]">
              <h4 className="text-sm font-medium text-[#006d43] mb-2">סיכום</h4>
              <ul className="space-y-1 text-sm text-gray-400">
                <li>• {productCount} מוצרים סה"כ</li>
                <li>• {productsPerDay} מוצרים ביום</li>
                <li>• כל יום בשעה {String(uploadHour).padStart(2, '0')}:00 ±{randomOffset} דקות</li>
                <li>• סיום תוך {daysNeeded} ימים</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 border border-[#1a2e24] rounded-xl text-gray-400 hover:text-white transition-colors text-sm">
                ביטול
              </button>
              <button
                onClick={handleStart}
                disabled={loading}
                className={`flex-2 flex-grow py-3 rounded-xl font-bold transition-all ${
                  loading ? 'bg-[#006d43]/50 cursor-not-allowed' : 'bg-[#006d43] hover:bg-[#008a54]'
                }`}
              >
                {loading ? 'מגדיר...' : '🚀 התחל העלאה'}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
