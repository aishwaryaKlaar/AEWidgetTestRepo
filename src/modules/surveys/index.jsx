import React, { useState } from 'react'
import { StepButton } from '../../components/StepButton.jsx'
import { showToast } from '../../components/Toast.jsx'
import { angularNavigate } from '../../core/navigate.js'
import { createSurveyTemplate, create360Template, createSurvey, create360Survey, create360Report, createNomination } from './actions.js'

const STEPS = [
  { label: 'Create Survey Template',  fn: createSurveyTemplate, isStub: false, redirectTo: '/health/launch-feedback' },
  { label: 'Create 360 Template',     fn: create360Template,    isStub: false, redirectTo: '/health/launch-feedback' },
  { label: 'Create Survey',           fn: createSurvey,         isStub: false, redirectTo: '/health/surveys' },
  { label: 'Create Nomination',       fn: createNomination,     isStub: false, redirectTo: '/health/feedback-nominations' },
  { label: 'Create 360 Survey',       fn: create360Survey,      isStub: false, redirectTo: '/health/surveys' },
  { label: 'Create 360 Report',       fn: create360Report,      isStub: false, redirectTo: '/health/surveys' },
]

export function SurveysModule() {
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
        <span>Surveys</span>
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
