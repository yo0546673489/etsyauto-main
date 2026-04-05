import { NextRequest, NextResponse } from 'next/server'

const WINDOWS_SERVER = process.env.WINDOWS_SERVER_URL || 'http://194.36.89.175:8001'
const API_KEY = process.env.INTERNAL_API_KEY || '16b72da1ef604967ac041896b58d53ec'

export async function GET(req: NextRequest) {
  const job_id = req.nextUrl.searchParams.get('job_id')
  const from = req.nextUrl.searchParams.get('from') || '0'
  const limit = req.nextUrl.searchParams.get('limit') || '5'
  try {
    const res = await fetch(
      `${WINDOWS_SERVER}/products?job_id=${job_id}&from_=${from}&limit=${limit}`,
      {
        headers: { 'x-internal-key': API_KEY },
        cache: 'no-store'
      }
    )
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
