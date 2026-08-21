import { api, getWorkspaceId } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { notImplemented } from '../../core/helpers.js'
import { fetchGroups } from '../../utils/fetchGroups.js'

function buildIdpOtherSettings(srsds) {
  return {
    toen: true, uepipg: true, uepipai: true, uepiptd: true,
    mepipg: true, mepipai: true, mepiptd: true, pipaidm: true,
    pipcg: true, pipcai: true, pipmg: 10, pipmai: 10, efrds: true,
    srsds, epipier: true, epipiec: true, piprdmta: 0,
    pipaem: true, pipaei: true, pipaeaa: true, pipaa: false, pipa: true,
    meidpg: true, meidpai: true, meidptd: true, mg: true, mai: true,
    idpa: true, idpr: true, pipr: true, pipauagt: true, pipauaat: true,
    pipmap: true, pipgdm: true, idpuaseg: true, idpuaseai: true,
    pipuaseg: true, pipuaseai: true, aicm: true, aidm: true, gcm: true,
    gdm: true, pdm: false,
    custom_labels: { idp: 'IDP', pip: 'PIP', action_item_name_column: 'Name', action_item: 'Action items', goals: 'Goals' },
    last_updated: new Date().toISOString(),
    allow_user_to_add_goal_type: true, allow_user_to_add_action_type: true,
    tracking_goal_and_action_item: 'status', maximum_action_items: 9,
    display_duedate_for_goal_and_action_items: false,
    allow_user_to_add_development_plan: true,
    goal_status_list: ['Getting Started', 'On Track', 'Completed'],
    workspace_admins_to_send_notification: [state.adminUserId || state.adminOrgUserId].filter(Boolean),
    reminder_configuration: {
      times: [], channels: ['EMAIL', 'SLACK'],
      monthly: { one: { days: [] }, two: { days: [] }, three: { days: [] }, four: { days: [] }, five: { days: [] } },
      time: '11:40',
      weekly: { days: [
        { times: [], channels: ['EMAIL', 'SLACK'], time: '11:40', day: 'THURSDAY' },
        { times: [], channels: ['EMAIL', 'SLACK'], time: '11:40', day: 'FRIDAY' },
      ] },
      every_hour: false,
    },
    action_item_status_list: ['Getting Started', 'On Track', 'Completed'],
    allow_user_to_add_date_action_items: true, maximum_goals: 10,
    AICM: true, AIDM: true, GCM: true, GDM: true, PDM: false,
  }
}

async function _setupPlans() {
  const wsId = getWorkspaceId()
  if (!wsId) return { ok: false, message: 'workspace-id missing' }
  const pasUrl = `/pas/api/v1/pas/${wsId}`

  let r = await api(pasUrl, {
    method: 'PATCH',
    body: JSON.stringify({ org_level: { allowed_modules: { idp: {
      other_settings: buildIdpOtherSettings([]),
      sub_modules: { development_plans: { is_visible: true }, my_team: { is_visible: true }, admin_overview: { is_visible: true }, admin_development_plans: { is_visible: true } },
    } } } }),
  })
  if (!r.ok) return { ok: false, message: `PAS baseline failed: ${r.status}` }

  const classifications = [
    { type_name: 'Quantifiable',     classification_for: 'goal',        plan_type: 'pip' },
    { type_name: 'Qualitative',      classification_for: 'goal',        plan_type: 'pip' },
    { __pasSrsdsUpdate: true },
    { type_name: 'Behavioral',       classification_for: 'goal',        plan_type: 'idp' },
    { type_name: 'Technical',        classification_for: 'goal',        plan_type: 'idp' },
    { type_name: 'On-the-job',       classification_for: 'action_item', plan_type: 'idp' },
    { type_name: 'Peer',             classification_for: 'action_item', plan_type: 'idp' },
    { type_name: 'Formal classroom', classification_for: 'action_item', plan_type: 'idp' },
  ]
  if (!state.idpClassificationsSetup) {
    for (const c of classifications) {
      if (c.__pasSrsdsUpdate) {
        const srsds = state.ratingScaleId ? [state.ratingScaleId] : []
        if (srsds.length) {
          r = await api(pasUrl, { method: 'PATCH', body: JSON.stringify({ org_level: { allowed_modules: { idp: { other_settings: buildIdpOtherSettings(srsds) } } } }) })
          if (!r.ok) return { ok: false, message: `PAS srsds update failed: ${r.status}` }
        }
      } else {
        r = await api('/idp/idp/settings/classification_type/', { method: 'POST', body: JSON.stringify(c) })
        if (!r.ok) {
          const body = (r.text || '').toLowerCase()
          if (!body.includes('exist')) return { ok: false, message: `Classification "${c.type_name}" failed: ${r.status}` }
        }
      }
    }
    state.idpClassificationsSetup = true
    saveState()
  }
  return { ok: true, message: `Configured PAS + ${classifications.length - 1} classification types (PIP: 2, IDP: 5)` }
}

const IDP_NAMES = [
  'Principal Engineering & Systems Mastery Blueprint',
  'Strategic General Management & P&L Readiness Track',
  'Autonomous Craftsmanship & High-Agency Growth Plan',
  'Cross-Functional Influence & Ecosystem Leadership Journey',
  'Frontier Technology & Applied Innovation Fellowship',
  'Individual Contributor to Organizational Multiplier Path',
  'Domain Depth & Multi-Disciplinary Mobility Continuum',
  'Emerging Executive & Enterprise Stewardship Accelerator',
  'Technical Architecture & Resilience Leadership Circuit',
  'Continuous Discovery & Product Craft Elevation Framework',
];
async function _createIDPPlan({ name, groupId }) {
  const r1 = await api('/idp/idp/development_plan/', {
    method: 'POST',
    body: JSON.stringify({ name, created_by: 'Admin', start_at: null, end_at: null }),
  })
  if (!r1.ok) return { ok: false, message: `Create plan failed: ${r1.status}` }
  const planId = r1.data?.id || r1.data?.data?.id
  if (!planId) return { ok: false, message: 'No plan id in response' }

  const planUrl   = `/idp/idp/development_plan/${planId}/?view=undefined`
  const checksUrl = `/idp/idp/plans/${planId}/checks/`
  const patch = (body) => api(planUrl,   { method: 'PATCH', body: JSON.stringify(body) })
  const check = (body) => api(checksUrl, { method: 'PUT',   body: JSON.stringify(body) })

  const now    = new Date().toISOString()
  const end45d = new Date(Date.now() + 45 * 86400000).toISOString()

  const steps = [
    [patch, { participants: [groupId], exclusion_list: [] }],
    [check, { type: 'IDP', checks: ['participant_check'] }],
    [patch, { start_at: now, end_at: end45d }],
    [check, { type: 'IDP', checks: ['duration_check'] }],
    [patch, { dev_plan_introduction: null }],
    [check, { type: 'IDP', checks: ['introduction_check'] }],
    [check, { type: 'IDP', checks: ['configure_goals_check'] }],
    [patch, { is_strength_enable: false }],
    [check, { type: 'IDP', checks: ['strength_check'] }],
    [patch, { allowed_additional_goal: false, allow_editing_existing_goal: false, allow_adding_notes: true }],
    [check, { type: 'IDP', checks: ['optional_settings_check'] }],
  ]
  for (const [fn, body] of steps) {
    const r = await fn(body)
    if (!r.ok) return { ok: false, message: `Step failed (${r.status}): ${JSON.stringify(body).slice(0, 60)}` }
  }
  return { ok: true }
}

const COMPETENCY_LIST = [
  { name: 'AlgorithmicPrecision', description: 'Deconstructs complex edge cases to deliver robust, high-performance logic with minimal computational overhead.' },
  { name: 'TelemetryObsession', description: 'Instruments deep observability and real-time monitoring across platforms to detect bottlenecks before users do.' },
  { name: 'AutonomousExecution', description: 'Operates with strong individual ownership and high agency to translate ambiguous requirements into shippable value.' },
  { name: 'CognitiveHumility', description: 'Actively seeks contrarian feedback, acknowledges blind spots, and pivots technical approaches without defensive bias.' },
  { name: 'SiloDecoupling', description: 'Architects independent interfaces and modular operational contracts to prevent cross-team dependency lock-in.' },
  { name: 'ResilienceEngineering', description: 'Proactively designs self-healing systems and automated failover topologies that withstand infrastructure faults.' },
  { name: 'ExecutiveBrevity', description: 'Distills highly complex technical trade-offs into crisp, high-signal briefings tailored for leadership decision-making.' },
  { name: 'ZeroTrustMindset', description: 'Embeds least-privilege access, immutable audit logging, and cryptographic verification into every layer of the stack.' },
  { name: 'UnitEconomicsGrip', description: 'Monitors cloud cost drivers and infrastructure utilization to guarantee margins scale sustainably alongside traffic.' },
  { name: 'HighSignalMentorship', description: 'Accelerates team talent density through regular peer pairing, code reviews, and structured knowledge transfers.' },
  { name: 'FrictionReduction', description: 'Relentlessly targets and automates repetitive developer toil to maximize focused engineering deep-work time.' },
  { name: 'ContractReliability', description: 'Designs backward-compatible, stable API boundaries and event schemas that protect upstream and downstream consumers.' },
  { name: 'PrincipledCandor', description: 'Voices constructive dissent early, raises uncomfortable operational realities transparently, and commits fully once aligned.' },
  { name: 'ContextualAgility', description: 'Shifts seamlessly between micro-level technical debugging and macro-level business objective calibration.' },
  { name: 'ProductLedDiscovery', description: 'Validates hypotheses rapidly through low-fidelity prototypes, behavioral metrics, and direct continuous discovery loops.' },
];

// Confirmed via a real Klaar UI request: POST with no body, response is
// {success, message, data: [{id, type_name, ...}, ...]} — picks the first available type.
async function _resolveCompetencyTypeId() {
  if (state.competencyTypeId) return state.competencyTypeId

  const r = await api('/review/get_competency_types', { method: 'POST' })
  if (!r.ok) return null

  const id = r.data?.data?.[0]?.id || null
  if (id) { state.competencyTypeId = id; saveState() }
  return id
}

// Step 1: Competencies — resolves a competency type then creates competencies
export async function createCompetencies() {
  const typeId = await _resolveCompetencyTypeId()
  if (!typeId) return { ok: false, message: 'Could not find or create a competency type.' }

  const created = [], failed = []
  for (const c of COMPETENCY_LIST) {
    const r = await api('/review/create_competency', {
      method: 'POST',
      body: JSON.stringify({ name: c.name, description: c.description, type_id: typeId }),
    })
    if (r.ok) {
      created.push(c.name)
    } else {
      const body = (r.text || '').toLowerCase()
      if (body.includes('exist') || body.includes('already')) {
        created.push(c.name)
      } else {
        failed.push(`${c.name} (${r.status})`)
      }
    }
  }

  if (!created.length) return { ok: false, message: `All competencies failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length}/9 competencies: ${created.join(', ')}${failNote}` }
}

// Step 2: Create IDP — configures workspace settings then creates 6 IDP development plans
export async function createIDP() {
  // Phase 1: configure workspace IDP/PIP settings
  const setup = await _setupPlans()
  if (!setup.ok) return setup

  // Phase 2: resolve groups (prefer created groups, exclude built-in)
  if (!state.groups?.length) {
    const g = await fetchGroups()
    if (!g.ok) return { ok: false, message: 'Could not load groups: ' + g.message }
  }
  let groups = (state.groups || []).filter(g => g.id)
  const customGroups = groups.filter(g => !/^(all\s*company|workspace\s*group)/i.test(g.name || ''))
  if (customGroups.length) groups = customGroups
  if (!groups.length) return { ok: false, message: 'No groups found. Run "Add Group" or "Bulk Upload Group" first.' }

  // Phase 3: create 6 IDP plans, cycling through available groups
  const created = [], failed = []
  for (let i = 0; i < IDP_NAMES.length; i++) {
    const groupId = groups[i % groups.length].id
    const r = await _createIDPPlan({ name: IDP_NAMES[i], groupId })
    if (r.ok) created.push(IDP_NAMES[i])
    else failed.push(`${IDP_NAMES[i]} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `Setup ok but all plans failed: ${failed.join(' | ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Configured IDP settings + created ${created.length}/6 plans: ${created.join(', ')}${failNote}` }
}

const PIP_NAMES = [
  'Milestone Realignment & Delivery Roadmap',
  'Execution Consistency & Focus Blueprint',
  'Core Impact & Accountabilities Compact',
  'Professional Competency Restoration Framework',
  'Strategic Velocity Recovery Initiative',
  'Targeted Output & Delivery Pathway',
  'Operational Standards Alignment Plan',
  'Performance Turnaround & Mentorship Action Plan',
  'Skill Precision & Execution Enhancement Program',
  'Foundational Excellence & Growth Protocol',
];

async function _createPIPPlan({ name, groupId }) {
  const r1 = await api('/idp/idp/meta/pip/admin/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  if (!r1.ok) return { ok: false, message: `Create PIP failed: ${r1.status}` }
  const planId = r1.data?.id || r1.data?.data?.id || r1.data?.plan_id
  if (!planId) return { ok: false, message: 'No plan id in PIP create response' }

  const checksUrl = `/idp/idp/plans/${planId}/checks/`
  const check = (checks) => api(checksUrl, { method: 'PUT', body: JSON.stringify({ type: 'PIP', checks }) })

  // Step 1b: GET initial checks state
  await api(`${checksUrl}?type=PIP`)

  const steps = [
    // Step 2: Participants — PIP expects "group_{uuid}" prefix
    () => api(`/idp/idp/meta/participants/${planId}/`, {
      method: 'POST',
      body: JSON.stringify({ reviews: [], calibration: [], groups: [groupId.startsWith('group_') ? groupId : `group_${groupId}`], exclusion_list: [] }),
    }),
    () => check(['participant_check']),
    // Step 3: Duration
    () => api(`/idp/idp/meta/${planId}/duration/`, {
      method: 'POST',
      body: JSON.stringify({ durations: [{ filter: 'default', type: 'days', value: 30 }] }),
    }),
    () => check(['duration_check']),
    // Step 4: Introduction
    () => api(`/idp/idp/meta/pip/admin/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ introduction: null }),
    }),
    () => check(['introduction_check']),
    // Step 5: Configure Goals
    () => check(['configure_goals_check']),
    // Step 6: Strengths
    () => api(`/idp/idp/meta/settings/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ strength_enabled: false }),
    }),
    () => check(['strength_check']),
    // Step 7: Optional settings
    () => api(`/idp/idp/meta/settings/${planId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        allow_modify_action_items: false,
        allow_modify_admin_created_improv_actions: false,
        allow_modify_improvements: false,
        enable_notes_participants: false,
      }),
    }),
    () => check(['optional_settings_check']),
  ]

  for (let i = 0; i < steps.length; i++) {
    const r = await steps[i]()
    if (!r.ok) return { ok: false, message: `PIP step ${i + 2} failed (${r.status})` }
  }
  return { ok: true }
}

// Step 3: Create PIP — configures workspace settings then creates 6 PIP plans
export async function createPIP() {
  const setup = await _setupPlans()
  if (!setup.ok) return setup

  if (!state.groups?.length) {
    const g = await fetchGroups()
    if (!g.ok) return { ok: false, message: 'Could not load groups: ' + g.message }
  }
  let groups = (state.groups || []).filter(g => g.id)
  const customGroups = groups.filter(g => !/^(all\s*company|workspace\s*group)/i.test(g.name || ''))
  if (customGroups.length) groups = customGroups
  if (!groups.length) return { ok: false, message: 'No groups found. Run "Add Group" or "Bulk Upload Group" first.' }

  const created = [], failed = []
  for (let i = 0; i < PIP_NAMES.length; i++) {
    const groupId = groups[i % groups.length].id
    const r = await _createPIPPlan({ name: PIP_NAMES[i], groupId })
    if (r.ok) created.push(PIP_NAMES[i])
    else failed.push(`${PIP_NAMES[i]} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `Setup ok but all PIP plans failed: ${failed.join(' | ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length}/6 PIP plans: ${created.join(', ')}${failNote}` }
}

export const createPIP2 = notImplemented('Additional PIP configuration steps')
