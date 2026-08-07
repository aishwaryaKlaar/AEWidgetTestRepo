import React, { useState } from 'react'
import { StepButton } from '../../components/StepButton.jsx'
import { showToast } from '../../components/Toast.jsx'
import { angularNavigate } from '../../core/navigate.js'
import { createRatingScale, createReviews, createReports } from './actions.js'

const STEPS = [
  { label: 'Create Rating Scale', fn: createRatingScale, isStub: false, redirectTo: '/performance-review/review-settings' },
  { label: 'Reviews',             fn: createReviews,     isStub: false, redirectTo: '/performance-review/reviews' },
  { label: 'Reports',             fn: createReports,     isStub: false, redirectTo: '/performance-review/reports' },
]

export function ReviewsModule() {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(null)

  async function run(step, idx) {
    setLoading(idx)
    try {
      const r = await step.fn()
      if (r?.ok) {
        showToast(r.message || 'Done', 'ok')
        if (step.redirectTo) {
          angularNavigate(step.redirectTo)
        }
      } else if (r?.message?.startsWith('Not yet wired')) {
        showToast(r.message, 'warn')
      } else {
        showToast(r?.message || 'Failed', 'err')
      }
    } catch (e) { showToast('Error: ' + e.message, 'err') }
    finally { setLoading(null) }
  }

  return (
    <div className={`section${open ? ' open' : ''}`}>
      <div className="section-header" onClick={() => setOpen(o => !o)}>
        <span>Reviews</span>
        <span className="caret">▶</span>
      </div>
      <div className="section-body">
        {STEPS.map((step, i) => (
          <StepButton key={i} label={step.label} onClick={() => run(step, i)} loading={loading === i} isStub={step.isStub} />
        ))}
      </div>
    </div>
  )
}
