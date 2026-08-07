import React, { useState } from 'react'
import { StepButton } from '../../components/StepButton.jsx'
import { SubSection } from '../../components/SubSection.jsx'
import { showToast } from '../../components/Toast.jsx'
import { angularNavigate } from '../../core/navigate.js'
import { setupDemoDomain, bulkUploadUser, addRoles, addManagers, addEmployees, bulkUploadGroup, addGroup } from './actions.js'

const USER_LIST_PATH  = '/settings/workspace/User-List'
const GROUP_LIST_PATH = '/settings/groups'

const TOP_STEPS = [
  { label: 'Bulk Upload User',  fn: bulkUploadUser,  isStub: false, redirectTo: USER_LIST_PATH },
  { label: 'Add Roles',         fn: addRoles,         isStub: false, redirectTo: USER_LIST_PATH, tabText: 'role', sidebarText: 'Roles' },
  { label: 'Bulk Upload Group', fn: bulkUploadGroup,  isStub: false, redirectTo: GROUP_LIST_PATH },
  { label: 'Add Group',         fn: addGroup,         isStub: false, redirectTo: GROUP_LIST_PATH },
]

const ADD_USER_STEPS = [
  { label: 'Add Managers',  fn: addManagers,  isStub: false, redirectTo: USER_LIST_PATH },
  { label: 'Add Employees', fn: addEmployees, isStub: false, redirectTo: USER_LIST_PATH },
]

export function UsersModule() {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(null)

  async function run(step) {
    setLoading(step.label)
    try {
      const r = await step.fn()
      if (r?.ok) {
        showToast(r.message || 'Done', 'ok')
        if (step.redirectTo) {
          angularNavigate(step.redirectTo)
          if (step.tabText) {
            setTimeout(() => {
              const tab = Array.from(document.querySelectorAll('[role="tab"]'))
                .find(el => el.textContent.trim().toLowerCase().includes(step.tabText))
              if (tab) tab.click()

              if (step.sidebarText) {
                setTimeout(() => {
                  const sidebarEl = Array.from(document.querySelectorAll('*')).find(el => {
                    const txt = (el.innerText || el.textContent || '').trim()
                    return txt === step.sidebarText &&
                      el.getAttribute('role') !== 'tab' &&
                      !el.className.includes('ant-tabs-tab')
                  })
                  if (sidebarEl) {
                    const clickTarget = sidebarEl.closest('a, button, [class*="item"], li') || sidebarEl.parentElement
                    if (clickTarget) clickTarget.click()
                    else sidebarEl.click()
                  }
                }, 1500)
              }
            }, 800)
          }
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
        <span>Users</span>
        <span className="caret">▶</span>
      </div>
      <div className="section-body">
        <StepButton
          label="Setup Demo Domain"
          onClick={() => run({ label: 'Setup Demo Domain', fn: setupDemoDomain })}
          loading={loading === 'Setup Demo Domain'}
          isStub={false}
        />

        <StepButton
          label="Bulk Upload User"
          onClick={() => run(TOP_STEPS[0])}
          loading={loading === 'Bulk Upload User'}
          isStub={TOP_STEPS[0].isStub}
        />

        <SubSection label="Add User">
          {ADD_USER_STEPS.map(step => (
            <StepButton
              key={step.label}
              label={step.label}
              onClick={() => run(step)}
              loading={loading === step.label}
              isStub={step.isStub}
            />
          ))}
        </SubSection>

        {TOP_STEPS.slice(1).map(step => (
          <StepButton
            key={step.label}
            label={step.label}
            onClick={() => run(step)}
            loading={loading === step.label}
            isStub={step.isStub}
          />
        ))}
      </div>
    </div>
  )
}
