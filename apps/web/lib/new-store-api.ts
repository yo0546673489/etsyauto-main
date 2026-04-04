import { StartResearchParams, ResearchJob } from '@/types/new-store'

const WINDOWS_SERVER = process.env.WINDOWS_SERVER_URL || 'http://45.143.167.147:8001'
const API_KEY = process.env.INTERNAL_API_KEY!

export async function startResearch(params: StartResearchParams): Promise<string> {
  const res = await fetch(`${WINDOWS_SERVER}/research/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': API_KEY
    },
    body: JSON.stringify(params)
  })
  if (!res.ok) throw new Error(`שגיאה בהתחלת מחקר: ${res.status}`)
  const data = await res.json()
  return data.job_id
}

export async function getJobStatus(jobId: string): Promise<ResearchJob> {
  const res = await fetch(`${WINDOWS_SERVER}/research/${jobId}/status`, {
    headers: { 'x-internal-key': API_KEY }
  })
  if (!res.ok) throw new Error('לא ניתן לקבל סטטוס')
  return res.json()
}
