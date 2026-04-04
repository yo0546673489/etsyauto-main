'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import StartResearchForm from '@/components/new-store/StartResearchForm'

export default function NewStorePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart(params: { price_min: number; price_max: number; category?: string }) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stores/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      if (!res.ok) throw new Error('שגיאה בהתחלת המחקר')
      const { job_id } = await res.json()
      router.push(`/stores/new/${job_id}`)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-6 py-10" dir="rtl">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-[#006d43] mb-3">פתיחת חנות חדשה</h1>
          <p className="text-gray-400 text-lg">
            המערכת תחקור נישות, תבחר 30 מוצרים מנצחים ותכין הכל אוטומטית.
          </p>
        </div>

        <StartResearchForm onStart={handleStart} loading={loading} />

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300">
            {error}
          </div>
        )}

        <div className="mt-12 p-6 bg-[#111] border border-[#1a2e24] rounded-2xl">
          <h3 className="text-[#006d43] font-semibold mb-4">מה יקרה עכשיו?</h3>
          <ol className="space-y-3 text-gray-400">
            {[
              'המערכת תחפש נישה מנצחת לפי הפרמטרים שהגדרת',
              'תאמת שהנישה עומדת בכל הקריטריונים של המנטור',
              'תבחר 30 מוצרים מוכחים מחנויות מצליחות',
              'תכתוב כותרות, 13 תגים ותיאורים לכל מוצר',
              'תייצר 5 תמונות AI מקצועיות לכל מוצר',
              'הכל יופיע בזמן אמת — מוצר אחרי מוצר'
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-[#006d43] font-bold mt-0.5">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-gray-500 text-sm">זמן משוער: 30-60 דקות</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
