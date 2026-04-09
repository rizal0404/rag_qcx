'use client'

interface ConfidenceIndicatorProps {
  confidence?: number
}

function getTone(confidence: number) {
  if (confidence >= 0.8) {
    return {
      label: 'High grounding',
      bar: 'bg-emerald-500',
      text: 'text-emerald-700',
      track: 'bg-emerald-100',
    }
  }

  if (confidence >= 0.6) {
    return {
      label: 'Moderate grounding',
      bar: 'bg-amber-500',
      text: 'text-amber-700',
      track: 'bg-amber-100',
    }
  }

  return {
    label: 'Low grounding',
    bar: 'bg-rose-500',
    text: 'text-rose-700',
    track: 'bg-rose-100',
  }
}

export default function ConfidenceIndicator({ confidence }: ConfidenceIndicatorProps) {
  if (typeof confidence !== 'number') {
    return null
  }

  const normalized = Math.max(0, Math.min(1, confidence))
  const tone = getTone(normalized)

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className={`font-semibold uppercase tracking-[0.14em] ${tone.text}`}>{tone.label}</span>
        <span className="text-slate-500">{Math.round(normalized * 100)}%</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${tone.track}`}>
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${normalized * 100}%` }} />
      </div>
    </div>
  )
}
