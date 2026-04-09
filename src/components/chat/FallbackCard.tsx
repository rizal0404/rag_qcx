'use client'

export default function FallbackCard() {
  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
        Fallback Response
      </div>
      <p className="mt-2 leading-6">
        Retrieval confidence is below the configured threshold. Refine the query with a section title, component name,
        page number, or exact specification term to get a stronger grounded answer.
      </p>
    </div>
  )
}
