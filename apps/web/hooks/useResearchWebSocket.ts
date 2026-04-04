'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { WSEvent, Product, SelectedNiche } from '@/types/new-store'

const WINDOWS_SERVER_WS = process.env.NEXT_PUBLIC_WINDOWS_SERVER_WS || 'ws://45.143.167.147:8001'
const API_KEY = process.env.NEXT_PUBLIC_INTERNAL_KEY || ''

interface UseResearchWSReturn {
  status: 'connecting' | 'connected' | 'disconnected' | 'done' | 'error'
  progress: number
  currentStep: string
  products: Product[]
  selectedNiche: SelectedNiche | null
  errorMessage: string | null
}

export function useResearchWebSocket(jobId: string | null): UseResearchWSReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)

  const [status, setStatus] = useState<UseResearchWSReturn['status']>('connecting')
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('מאתחל...')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedNiche, setSelectedNiche] = useState<SelectedNiche | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const connect = useCallback(() => {
    if (!jobId || !mountedRef.current) return

    const url = `${WINDOWS_SERVER_WS}/research/${jobId}/ws?key=${API_KEY}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setStatus('connected')
      clearTimeout(reconnectTimer.current)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const data: WSEvent = JSON.parse(event.data)
        switch (data.type) {
          case 'progress':
            setProgress(data.progress)
            setCurrentStep(data.step)
            break
          case 'niche_selected':
            setSelectedNiche(data.niche)
            setCurrentStep(`✅ נישה נבחרה: ${data.niche.hebrew_name}`)
            break
          case 'product_ready':
            setProducts(prev => [...prev, data.product])
            setCurrentStep(`מכין מוצר ${data.products_ready} מתוך 30...`)
            break
          case 'done':
            setStatus('done')
            setProgress(100)
            setCurrentStep(`✅ ${data.total_products} מוצרים מוכנים!`)
            break
          case 'error':
            setStatus('error')
            setErrorMessage(data.message)
            break
        }
      } catch (e) {
        console.error('שגיאת parsing WebSocket:', e)
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      if (status !== 'done') {
        setStatus('disconnected')
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => { ws.close() }
  }, [jobId])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { status, progress, currentStep, products, selectedNiche, errorMessage }
}
