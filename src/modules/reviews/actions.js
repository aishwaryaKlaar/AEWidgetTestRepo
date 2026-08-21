import { api, getOrgUserIdFromJwt } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { notImplemented } from '../../core/helpers.js'
import { fetchGroups } from '../../utils/fetchGroups.js'
import { fetchTimePeriods } from '../../utils/fetchTimePeriods.js'
import { fetchRatingScales } from '../../utils/fetchRatingScales.js'

function _findCompanyGroupId() {
  if (state.groups && state.groups.length) {
    const allCompany = state.groups.find(g => /^all\s*company$/i.test(g.name || ''))
    const wsGroup = state.groups.find(g => /workspace\s*group/i.test(g.name || ''))
    const partial = state.groups.find(g => /(all\s*company|company\s*workspace)/i.test(g.name || ''))
    const match = (allCompany || wsGroup || partial)?.id
    if (match) return match
  }
  return state.workspaceGroupId || state.groups?.[0]?.id || null
}

function _findTimePeriodByMatcher(matcher) {
  if (!state.timePeriods || !state.timePeriods.length) return null
  const tp = state.timePeriods.find(t => matcher.test(t.name || ''))
  return tp ? { id: tp.id, name: tp.name } : null
}

function _quarterlyEvalParams(ratingScaleId) {
  const dataItem = (id, name, opOverride = 'OPTIONAL') => ({
    id, name,
    reviewees_goals: { comments: 'MANDATORY', ratings: 'OPTIONAL', field_settings: 'BOTH' },
    feedback_form: { survey: { name: '', id: '' }, status: 'MANDATORY' },
    competencies: { comments: 'MANDATORY', ratings: 'OPTIONAL', field_settings: 'ALL' },
    overall_performance: { comments: 'MANDATORY', ratings: opOverride },
  })
  return {
    headers_config: { no: true, reviewees_goals: false, feedback_form: false, competencies: false, overall_performance: true, reviewers: true },
    reviewers_config: { PAST_L1_MANAGER: false, DIRECT_REPORTS: false, PEERS: false, SECONDARY_MATRIX_MANAGER: false, L1_MANAGER: true, SELF: true, PRIMARY_MATRIX_MANAGER: false, DEPARTMENT_HEAD: false, L2_MANAGER: false },
    data: [
      dataItem('SELF', 'Self', 'MANDATORY'),
      dataItem('L1_MANAGER', 'Manager', 'MANDATORY'),
      dataItem('L2_MANAGER', 'Skip Manager'),
      dataItem('DIRECT_REPORTS', 'Direct Reports'),
      dataItem('PEERS', 'Peers'),
      dataItem('PAST_L1_MANAGER', 'Previous Manager'),
      dataItem('PRIMARY_MATRIX_MANAGER', 'Primary Matrix Manager'),
      dataItem('SECONDARY_MATRIX_MANAGER', 'Secondary Matrix Manager'),
      dataItem('DEPARTMENT_HEAD', 'Department Head'),
    ],
    rating_scale_ids: { overall_performance: ratingScaleId, reviewees_goals: ratingScaleId, competencies: ratingScaleId },
  }
}

async function _createReview(opts) {
  const groupId = opts.groupId
  if (!groupId) return { ok: false, message: 'No group found. Run "Bulk Upload Group" first.' }
  const tp = opts.timePeriod
  if (!tp) return { ok: false, message: 'No time period found. Run "Create Time Period" first.' }
  const ratingScaleId = opts.ratingScaleId || state.ratingScaleId
  if (!ratingScaleId) return { ok: false, message: 'No rating scale. Run "Create Rating Scale" first.' }

  const r1 = await api(`/reviewj/api/v1/reviews/?fromTemplate=${opts.fromTemplate}`, { method: 'POST', body: JSON.stringify({}) })
  if (!r1.ok) return { ok: false, message: `Create review failed: ${r1.status}` }
  const reviewId = r1.data?.data?.id || r1.data?.id
  if (!reviewId) return { ok: false, message: 'No review id in response' }

  const reviewsUrl = `/reviewj/api/v1/reviews/?reviewId=${reviewId}`
  const updateUrl = `/review/update_review_for_review_id/${reviewId}`
  const patch = (url, body) => api(url, { method: 'PATCH', body: JSON.stringify(body) })

  if (opts.endDate) {
    const r1b = await patch(reviewsUrl, { end_date: opts.endDate })
    if (!r1b.ok) return { ok: false, message: `Set end_date failed: ${r1b.status}` }
  }
  const calls = [
    [reviewsUrl, { name: opts.reviewName }, 'name'],
    [reviewsUrl, { config_chapter_status: { settings: true } }, 'settings'],
    [updateUrl, { reviewees: [groupId] }, 'reviewees'],
    [reviewsUrl, { config_chapter_status: { reviewees: true } }, 'reviewees-status'],
    [updateUrl, { time_period: tp }, 'time_period'],
    [reviewsUrl, { config_chapter_status: { reviewers: true } }, 'reviewers-status'],
    [updateUrl, { evaluation_parameters: _quarterlyEvalParams(ratingScaleId) }, 'evaluation_parameters'],
    [reviewsUrl, { config_chapter_status: { reviewersScope: true } }, 'reviewersScope'],
    [reviewsUrl, { config_chapter_status: { nudges: true } }, 'nudges'],
    [reviewsUrl, { config_chapter_status: { optionalSettings: true } }, 'optionalSettings'],
    [updateUrl, { state: 'Published' }, 'publish'],
  ]
  let n = 2
  for (const [url, body, label] of calls) {
    const r = await patch(url, body)
    if (!r.ok) return { ok: false, message: `Call ${n} (${label}) failed: ${r.status}` }
    n++
  }
  state.lastReviewId = reviewId
  saveState()
  return { ok: true, message: `Review "${opts.reviewName}" published (${reviewId.slice(0, 8)}…)` }
}

function _currentYear() { return new Date().getFullYear() }
function _currentQuarterName() {
  const m = new Date().getMonth() + 1
  const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4'
  return `${q} ${_currentYear()}`
}

const RATING_SCALE_NAMES = [
  '5-Point Executive Execution & Value Index',
  '5-Level Technical Proficiency & Mastery Scale',
  '5-Point Operational Excellence Spectrum',
  '5-Level Talent Capability & Impact Matrix',
  '5-Point Strategic Alignment Benchmark',
  '5-Level Enterprise Output & Merit Continuum',
  '5-Point High-Performance Contribution Index',
  '5-Level Organizational Leadership Spectrum',
  '5-Point Business Results & Delivery Framework',
  '5-Level Domain Mastery & Growth Scale',
  '5-Point Enterprise Competency Rating Spectrum',
];

const RATING_OPTIONS = [
  { label: 'Needs Improvement',    value: 1,
    description: 'Requires significant improvement to consistently meet role expectations.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Below Expectations',   value: 2,
    description: 'Performance occasionally meets expectations but needs greater consistency.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Meets Expectations',   value: 3,
    description: 'Consistently fulfills role responsibilities and expected performance standards.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Exceeds Expectations', value: 4,
    description: 'Frequently delivers results beyond expectations with minimal guidance.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Outstanding',          value: 5,
    description: 'Consistently achieves exceptional results and sets a benchmark for excellence.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
]

// Step 1: Create Rating Scale — creates 10 dummy rating scales
export async function createRatingScale() {
  const created = []
  const failed = []

  for (const name of RATING_SCALE_NAMES) {
    const r = await api('/review/create_rating', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    if (r.ok) {
      const id = r.data?.data?.id || r.data?.id
      if (id) {
        await api(`/review/update_rating_for_rating_id/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ rating_options: RATING_OPTIONS }),
        })
      }
      created.push({ name, id })
    } else {
      const body = (r.text || '').toLowerCase()
      if (r.status === 400 && body.includes('exist')) {
        created.push({ name, id: null, existing: true })
      } else {
        console.log(`[createRatingScale] failed for "${name}":`, r.status, r.text)
        failed.push(`${name} (${r.status})`)
      }
    }
  }

  if (!created.length) {
    return { ok: false, message: `All failed: ${failed.join(', ')}` }
  }

  // Save full list + first ID so createReviews can cycle through all scales
  const withIds = created.filter(s => s.id)
  if (withIds.length) {
    state.ratingScaleId = withIds[0].id
    state.ratingScales = withIds.map(s => ({ id: s.id, name: s.name }))
    saveState()
  }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return {
    ok: true,
    message: `Created ${created.length} rating scales${failNote}`,
  }
}

// Step 2: Reviews — creates 6 reviews, each with a different group / time period / rating scale
export async function createReviews() {
  const y = _currentYear()

  // --- Resolve groups — prefer created groups, exclude built-in "All Company" ---
  if (!state.groups?.length) {
    const g = await fetchGroups()
    if (!g.ok) return { ok: false, message: 'Could not load groups: ' + g.message }
  }
  let groups = (state.groups || []).filter(g => g.id)
  const customGroups = groups.filter(g => !/^(all\s*company|workspace\s*group)/i.test(g.name || ''))
  if (customGroups.length) groups = customGroups
  if (!groups.length) return { ok: false, message: 'No groups found. Run "Bulk Upload Group" or "Add Group" first.' }

  // --- Resolve rating scales — use all created scales, cycle one per review ---
  let ratingScales = (state.ratingScales || []).filter(s => s.id)
  if (!ratingScales.length) {
    const rs = await fetchRatingScales()
    if (!rs.ok) return { ok: false, message: 'No rating scales. Run "Create Rating Scale" first.' }
    ratingScales = (state.ratingScales || []).filter(s => s.id)
    if (!ratingScales.length && state.ratingScaleId) ratingScales = [{ id: state.ratingScaleId }]
  }
  if (!ratingScales.length) return { ok: false, message: 'No rating scales found. Run "Create Rating Scale" first.' }

  // --- Resolve ALL time periods — cycle one per review ---
  let timePeriods = (state.timePeriods || []).filter(t => t.id)
  if (!timePeriods.length) {
    const orgId = getOrgUserIdFromJwt()
    if (orgId) {
      const r = await api(`/okr/performance/time_period/?sheet_user_id=${orgId}&page=1&page_size=50`)
      if (r.ok) {
        timePeriods = (r.data?.results || []).map(t => ({ id: t.id, name: t.name }))
        state.timePeriods = timePeriods
        saveState()
      }
    }
  }
  if (!timePeriods.length && state.timePeriodId) {
    timePeriods = [{ id: state.timePeriodId, name: state.timePeriodName || 'Active Period' }]
  }
  if (!timePeriods.length) return { ok: false, message: 'No time periods found. Run "Create Time Period" first.' }

  const REVIEWS = [

  { fromTemplate: 'yearEnd', reviewName: `Annual Strategic Horizon & Leadership Assessment ${y}`, endDate: `${y}-12-30T23:59:59.000Z` },
  { fromTemplate: 'midYear', reviewName: `Mid-Year Capabilities & Delivery Milestone Review ${y}`, endDate: `${y}-12-30T23:59:59.000Z` },

  { fromTemplate: 'quarterly', reviewName: `Q1 Objective Alignment & Foundation Kickoff ${y}` },
  { fromTemplate: 'quarterly', reviewName: `Q2 Mid-Flight Velocity & Friction Diagnostic ${y}` },
  { fromTemplate: 'quarterly', reviewName: `Q3 Value Delivery & Cross-Team Synergy Check ${y}` },
  { fromTemplate: 'quarterly', reviewName: `Q4 Annual Impact Synthesis & Wrap-up ${y}` },

];

  const created = [], failed = [], createdIds = []
  for (let i = 0; i < REVIEWS.length; i++) {
    const rev = REVIEWS[i]
    const groupId = groups[i % groups.length].id
    const timePeriod = timePeriods[i % timePeriods.length]
    const ratingScaleId = ratingScales[i % ratingScales.length].id
    const r = await _createReview({ ...rev, groupId, timePeriod, ratingScaleId })
    if (r.ok) { created.push(rev.reviewName); if (state.lastReviewId) createdIds.push(state.lastReviewId) }
    else failed.push(`${rev.reviewName} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `All reviews failed: ${failed.join(' | ')}` }

  if (createdIds.length) { state.reviewIds = createdIds; saveState() }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length}/6 reviews: ${created.join(', ')}${failNote}` }
}

const REPORT_NAMES = [
  'Developer Velocity & Engineering Friction Ledger',
  'Total Rewards & Equity Mobility Index',
  'Product-Led Growth & Retention Telemetry',
  'Incident Post-Mortem & Resilience Diagnostic',
  'Psychological Safety & Belonging Scorecard',
  'SaaS Spend Discipline & Vendor ROI Analytics',
  'Async Collaboration & Knowledge Hygiene Audit',
  'Security Posture & Compliance Integrity Brief',
  'Zero-Trust Architecture Maturity Report',
  'Cross-Functional Matrix Synergy Assessment',
];

async function _createOneReport({ name, calibrationId }) {
  // Step 1: Create system report
  const r1 = await api('/review/create_system_report', {
    method: 'POST',
    body: JSON.stringify({ name, are_acknowledgements_required: false }),
  })
  if (!r1.ok) return { ok: false, message: `Create "${name}" failed: ${r1.status}` }
  const reportId = r1.data?.id || r1.data?.data?.id
  if (!reportId) return { ok: false, message: `No report id returned for "${name}"` }

  // Step 2: Link calibration
  const r2 = await api(`/review/update_reviews_or_calibration_in_system_report?pms_sr_id=${reportId}`, {
    method: 'PATCH',
    body: JSON.stringify({ selected_calibration: calibrationId }),
  })
  if (!r2.ok) return { ok: false, message: `Link calibration for "${name}" failed: ${r2.status}` }

  // Step 3: Cover page
  const r3 = await api(`/review/update_system_report?pms_sr_id=${reportId}`, {
    method: 'PATCH',
    body: JSON.stringify({ cover_page: { report_name: name } }),
  })
  if (!r3.ok) return { ok: false, message: `Cover page for "${name}" failed: ${r3.status}` }

  // Step 4: Publish
  const r4 = await api(`/review/publish_system_report?pms_sr_id=${reportId}`)
  if (!r4.ok) return { ok: false, message: `Publish "${name}" failed: ${r4.status}` }

  return { ok: true }
}

// Step 3: Reports — creates 7 system reports linked to calibrations
export async function createReports() {
  const calibrationIds = state.calibrationIds?.length ? state.calibrationIds : null
  if (!calibrationIds) return { ok: false, message: 'No calibrations found. Run "Calibration → Create Calibration" first.' }

  const created = [], failed = []
  for (let i = 0; i < REPORT_NAMES.length; i++) {
    const name = REPORT_NAMES[i]
    const calibrationId = calibrationIds[i % calibrationIds.length]
    const r = await _createOneReport({ name, calibrationId })
    if (r.ok) created.push(name)
    else failed.push(`${name} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `All reports failed: ${failed.join(' | ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} reports: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}
export const viewReports = notImplemented('View review reports dashboard')
