import React, { useState } from 'react'
import { StepButton } from '../../components/StepButton.jsx'
import { showToast } from '../../components/Toast.jsx'
import { angularNavigate } from '../../core/navigate.js'
import { createCompetencies, createIDP, createPIP } from './actions.js'

const STEPS = [
  { label: 'Create Competencies', fn: createCompetencies, isStub: false,redirectTo: '/idp/admin-competencies?subtab=756a2431-032f-4976-b54b-46a392d01bd2' },
  { label: 'Create IDP',          fn: createIDP,          isStub: false, redirectTo: '/idp/admin-options/development-plans?tab=IDP' },
  { label: 'Create PIP',          fn: createPIP,          isStub: false, redirectTo: '/idp/admin-options/development-plans?tab=PIP' },
]

export function IDPsModule() {
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
        <span>IDPs</span>
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
