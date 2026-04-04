import { NextRequest, NextResponse } from 'next/server'
import { startResearch } from '@/lib/new-store-api'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { price_min, price_max, category } = body

    if (!price_min || !price_max) {
      return NextResponse.json({ error: 'נא להזין טווח מחיר' }, { status: 400 })
    }

    const job_id = await startResearch({
      price_min: Number(price_min),
      price_max: Number(price_max),
      category: category || null
    })

    return NextResponse.json({ job_id })
  } catch (error) {
    console.error('שגיאה בפתיחת חנות:', error)
    return NextResponse.json({ error: 'שגיאה בהתחלת המחקר' }, { status: 500 })
  }
}
