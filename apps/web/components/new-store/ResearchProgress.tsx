'use client'

interface Props {
  progress: number
  currentStep: string
  productsReady: number
}

const STEPS = [
  { label: 'מחפש נישות', threshold: 10 },
  { label: 'מנתח תחרות', threshold: 25 },
  { label: 'בוחר נישה', threshold: 35 },
  { label: 'מאתר מוצרים', threshold: 50 },
  { label: 'מכין תוכן', threshold: 75 },
  { label: 'מייצר תמונות', threshold: 90 },
  { label: 'מסיים', threshold: 100 },
]

export default function ResearchProgress({ progress, currentStep, productsReady }: Props) {
  return (
    <div className="bg-[#0d1a12] border border-[#1a2e24] rounded-2xl p-6">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">{currentStep}</span>
          <span className="text-sm font-bold text-[#006d43]">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-[#0a0f0d] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#006d43] to-[#00a060] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between mb-6">
        {STEPS.map((step, i) => {
          const isCompleted = progress >= step.threshold
          const isActive = progress >= (STEPS[i - 1]?.threshold ?? 0) && progress < step.threshold
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                isCompleted ? 'bg-[#006d43]' :
                isActive ? 'bg-[#006d43] animate-pulse scale-125' :
                'bg-[#1a2e24]'
              }`} />
              <span className={`text-xs hidden sm:block ${
                isCompleted || isActive ? 'text-gray-300' : 'text-gray-600'
              }`}>{step.label}</span>
            </div>
          )
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-[#0a0f0d] rounded-xl">
          <div className="text-2xl font-bold text-[#006d43]">{productsReady}</div>
          <div className="text-xs text-gray-500 mt-1">מוצרים מוכנים</div>
        </div>
        <div className="text-center p-3 bg-[#0a0f0d] rounded-xl">
          <div className="text-2xl font-bold text-white">30</div>
          <div className="text-xs text-gray-500 mt-1">יעד מוצרים</div>
        </div>
        <div className="text-center p-3 bg-[#0a0f0d] rounded-xl">
          <div className="text-2xl font-bold text-yellow-400">
            {progress < 100 ? `~${Math.round((100 - progress) * 0.4)}` : '0'}
          </div>
          <div className="text-xs text-gray-500 mt-1">דקות נותרו</div>
        </div>
      </div>
    </div>
  )
}
