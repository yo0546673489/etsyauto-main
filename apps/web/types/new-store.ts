export interface StartResearchParams {
  price_min: number
  price_max: number
  category?: string | null
}

export interface ResearchJob {
  job_id: string
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  current_step: string
  products_ready: number
}

export interface Product {
  id: string
  title: string
  tags: string[]
  description: string
  images: string[]
  price: number
  source_niche: string
}

export interface SelectedNiche {
  keyword: string
  hebrew_name: string
  score: number
  visual_style: string
}

export type WSEvent =
  | { type: 'progress'; step: string; progress: number }
  | { type: 'niche_selected'; niche: SelectedNiche }
  | { type: 'product_ready'; product: Product; products_ready: number }
  | { type: 'done'; total_products: number; niche: string }
  | { type: 'error'; message: string }

export interface UploadSettings {
  products_per_day: 1 | 2
  upload_hour: number
  random_offset_minutes: number
}
