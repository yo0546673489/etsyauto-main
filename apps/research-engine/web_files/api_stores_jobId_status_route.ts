import { NextRequest, NextResponse } from 'next/server'

const WINDOWS_SERVER = process.env.WINDOWS_SERVER_URL || 'http://194.36.89.175:8001'
const API_KEY = process.env.INTERNAL_API_KEY || '16b72da1ef604967ac041896b58d53ec'

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const res = await fetch(`${WINDOWS_SERVER}/research/${params.jobId}/status`, {
      headers: { 'x-internal-key': API_KEY },
      cache: 'no-store'
    })
    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'connection failed' }, { status: 500 })
  }
}
