import React, { useState } from 'react'
import { StepButton } from '../../components/StepButton.jsx'
import { SubSection } from '../../components/SubSection.jsx'
import { showToast } from '../../components/Toast.jsx'
import { angularNavigate } from '../../core/navigate.js'
import {
  createTimePeriod, createGoals, addGoalsAILibrary, defaultGoals,
  groupOKR, individualOKR, keyResult, keyResultGroup,
  addChildObjective, addChildObjectiveGroup,
} from './actions.js'

const GOAL_CYCLES_PATH  = '/performance/goal-cycles'
const ALL_GOALS_PATH    = '/performance/goals/all-goals'
const GOAL_LIBRARY_PATH = '/performance/goal-library'
const MY_GOALS_PATH     = '/performance/goals/my-goals'
const GROUP_GOALS_PATH  = '/performance/goals/groups?tab=groups'

const TOP_STEPS = [
  { label: 'Create Time Period',      fn: createTimePeriod,  redirectTo: GOAL_CYCLES_PATH  },
  { label: 'Import Goals',            fn: createGoals,       redirectTo: ALL_GOALS_PATH    },
  { label: 'Add Goals in AI Library', fn: addGoalsAILibrary, redirectTo: GOAL_LIBRARY_PATH },
  { label: 'Default Goals',           fn: defaultGoals,      redirectTo: '/performance/default-goals' },
]

const INDIVIDUAL_OKR_STEPS = [
  { label: 'Individual OKR',      fn: individualOKR,       key: 'ind-okr', redirectTo: MY_GOALS_PATH    },
  { label: 'Key Result',          fn: keyResult,           key: 'ind-kr',  redirectTo: MY_GOALS_PATH    },
  { label: 'Add Child Objective', fn: addChildObjective,   key: 'ind-co',  redirectTo: MY_GOALS_PATH    },
]

const GROUP_OKR_STEPS = [
  { label: 'Group OKR',           fn: groupOKR,               key: 'grp-okr', redirectTo: GROUP_GOALS_PATH },
  { label: 'Key Result',          fn: keyResultGroup,          key: 'grp-kr',  redirectTo: GROUP_GOALS_PATH },
  { label: 'Add Child Objective', fn: addChildObjectiveGroup,  key: 'grp-co',  redirectTo: GROUP_GOALS_PATH },
]

export function GoalsModule() {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(null)

  async function run(step) {
    setLoading(step.key || step.label)
    try {
      const r = await step.fn()
      if (r?.ok) {
        showToast(r.message || 'Done', 'ok')
        if (step.redirectTo) {
          angularNavigate(step.redirectTo)
        }
      } else {
        showToast(r?.message || 'Failed', 'err')
      }
    } catch (e) { showToast('Error: ' + e.message, 'err') }
    finally { setLoading(null) }
  }

  return (
    <div className={`section${open ? ' open' : ''}`}>
      <div className="section-header" onClick={() => setOpen(o => !o)}>
        <span>Goals</span>
        <span className="caret">▶</span>
      </div>
      <div className="section-body">
        {TOP_STEPS.map(step => (
          <StepButton
            key={step.label}
            label={step.label}
            onClick={() => run(step)}
            loading={loading === step.label}
          />
        ))}

        <SubSection label="Add Individual OKR">
          {INDIVIDUAL_OKR_STEPS.map(step => (
            <StepButton
              key={step.key}
              label={step.label}
              onClick={() => run(step)}
              loading={loading === step.key}
            />
          ))}
        </SubSection>

        <SubSection label="Add Group OKR">
          {GROUP_OKR_STEPS.map(step => (
            <StepButton
              key={step.key}
              label={step.label}
              onClick={() => run(step)}
              loading={loading === step.key}
            />
          ))}
        </SubSection>
      </div>
    </div>
  )
}
