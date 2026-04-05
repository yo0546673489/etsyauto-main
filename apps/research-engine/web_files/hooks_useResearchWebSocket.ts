'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Product, SelectedNiche } from '@/types/new-store'

interface UseResearchWSReturn {
  status: 'connecting' | 'connected' | 'disconnected' | 'done' | 'error'
  progress: number
  currentStep: string
  products: Product[]
  selectedNiche: SelectedNiche | null
  errorMessage: string | null
}

export function useResearchWebSocket(jobId: string | null): UseResearchWSReturn {
  const [status, setStatus] = useState<UseResearchWSReturn['status']>('connecting')
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('מאתחל...')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedNiche, setSelectedNiche] = useState<SelectedNiche | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const productsReadyRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const mountedRef = useRef(true)

  const poll = useCallback(async () => {
    if (!jobId || !mountedRef.current) return
    try {
      const res = await fetch(`/api/stores/${jobId}/status`, { cache: 'no-store' })
      if (!res.ok) { setStatus('error'); return }
      const data = await res.json()

      if (!mountedRef.current) return
      setProgress(data.progress ?? 0)
      setCurrentStep(data.current_step ?? '')

      if (data.status === 'running' || data.status === 'pending') {
        setStatus('connected')
      } else if (data.status === 'done') {
        setStatus('done')
        clearInterval(intervalRef.current)
      } else if (data.status === 'error') {
        setStatus('error')
        setErrorMessage(data.current_step ?? 'שגיאה לא ידועה')
        clearInterval(intervalRef.current)
      }

      // Fetch new products when count increases
      const newCount = data.products_ready ?? 0
      if (newCount > productsReadyRef.current) {
        try {
          const pRes = await fetch(
            `/api/stores/products?job_id=${jobId}&from=${productsReadyRef.current}&limit=5`,
            { cache: 'no-store' }
          )
          if (pRes.ok) {
            const newProducts: Product[] = await pRes.json()
            if (newProducts.length > 0 && mountedRef.current) {
              setProducts(prev => [...prev, ...newProducts])
              if (newProducts[0]?.source_niche && !selectedNiche) {
                setSelectedNiche({ keyword: newProducts[0].source_niche, hebrew_name: newProducts[0].source_niche, score: 0, visual_style: '' })
              }
            }
          }
        } catch {}
        productsReadyRef.current = newCount
      }
    } catch {
      if (mountedRef.current) setStatus('disconnected')
    }
  }, [jobId])

  useEffect(() => {
    mountedRef.current = true
    if (!jobId) return
    poll()
    intervalRef.current = setInterval(poll, 5000)
    return () => {
      mountedRef.current = false
      clearInterval(intervalRef.current)
    }
  }, [poll])

  return { status, progress, currentStep, products, selectedNiche, errorMessage }
}
