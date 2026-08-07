import { api, getWorkspaceId, getAdminUserIdFromJwt, getOrgUserIdFromJwt } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { _uuid, searchResults } from '../../core/helpers.js'

const _PERSONA_BASE = {
  persona_config: { SELF: false, L1_MANAGER: false, L2_MANAGER: false, DIRECT_REPORTS: false, DIRECT_REPORTS_OF_DIRECT_REPORTS: false, PRIMARY_MATRIX_MANAGER: false, SECONDARY_MATRIX_MANAGER: false, PEERS: false, STAKEHOLDERS: false },
  data: [],
}

function _qText(question, isRequired = true, labelVisibility = true) {
  return { is_required: isRequired, label_visibility: labelVisibility, id: _uuid(), comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {}, hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE, question_type: 'only_text', question, has_comments: {}, options: [] }
}
function _qMultiSelect(question, options, isRequired = true, labelVisibility = false) {
  return { is_required: isRequired, label_visibility: labelVisibility, id: _uuid(), comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {}, hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE, allow_multiple_answers: true, allow_minimum_select: 2, allow_maximum_select: 3, allow_select_all: false, allow_select_none: false, question_type: 'multi_select', question, options: options.map(o => ({ choice_name: o })), has_comments: { is_visible: false, is_mandatory: false } }
}
function _qChoice(question, opts, isRequired = true, labelVisibility = false) {
  return { is_required: isRequired, label_visibility: labelVisibility, id: _uuid(), comment_box: 'NOT_APPLICABLE', view: 'DROPDOWN', translations: {}, hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE, question_type: 'multiple_choice', question, options: opts.map((o, i) => ({ choice_name: o.name, label: String(i + 1), weight: String(i + 1), opt_out: false })), has_comments: { is_visible: false, is_mandatory: false } }
}
function _qNPS(question) {
  const options = []; for (let i = 1; i <= 10; i++) options.push({ choice_name: String(i), weight: i })
  return { id: _uuid(), is_required: true, translations: {}, comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', question_type: 'enps', question, has_comments: { is_visible: false, is_mandatory: false }, label_visibility: false, options }
}
function _qLikert(question) {
  const opts = [
    { name: 'Strongly disagree', label: '1', weight: 1 },
    { name: 'Disagree', label: '2', weight: 2 },
    { name: 'Neither agree nor disagree', label: '3', weight: 3 },
    { name: 'Agree', label: '4', weight: 4 },
    { name: 'Strongly Agree', label: '5', weight: 5 },
  ]
  return { id: _uuid(), is_required: true, translations: {}, persona_customization: _PERSONA_BASE, hide_question_in_pms_reports: false, comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', question_type: 'multiple_choice', question, options: opts.map(o => ({ choice_name: o.name, label: o.label, weight: o.weight, opt_out: false })), has_comments: { is_visible: false, is_mandatory: false }, label_visibility: true }
}
function _templatePayload(name, description, questions, type = '360', extra = {}) {
  return Object.assign({ name, long_description: description, short_description: description, audience_description: description, created_by: null, questions, type, has_persona_customization: false, org_id: getWorkspaceId(), id: '', status: 'PUBLISHED' }, extra)
}

const _CORE_THREE_QS = () => [
  _qText('What are the top 2 achievements for this person this quarter?'),
  _qText('What are the top 2 things they could have done better this quarter?'),
  _qMultiSelect('\nWhich 2 values of the organization did they live up to the most and why?', ['Bias for action', 'Think deeply, act quickly', 'Customer obsession', 'Default to trust', 'Set benchmarks', 'Run upwards']),
]
const _PROMOTION_Q = () => _qChoice('Would you recommend this person for a promotion and why?', [{ name: 'Yes' }, { name: 'No' }])

export function buildPeerTemplate() { return _templatePayload('Peer Reflection Template', 'Peer reflection template', _CORE_THREE_QS()) }
export function buildManagerTemplate() {
  const qs = _CORE_THREE_QS()
  qs.push(_PROMOTION_Q())
  qs.push(_qChoice("How would you rate this person's leadership potential?", [{ name: 'Excellent' }, { name: 'Good' }, { name: 'Average' }, { name: 'Needs Improvement' }]))
  return _templatePayload('Manager Reflection Template', 'Manager reflection template', qs)
}
export function buildSelfTemplate() {
  const qs = _CORE_THREE_QS()
  qs.push(_PROMOTION_Q())
  qs.push(_qChoice('How would you rate your own growth and development this quarter?', [{ name: 'Significant Growth' }, { name: 'Moderate Growth' }, { name: 'Steady Progress' }, { name: 'Needs More Focus' }]))
  return _templatePayload('Self Reflection Template', 'Self reflection template', qs)
}
export function buildEngagementTemplate() {
  const qs = [
    _qNPS('How likely are you to recommend your company as a place to work to a friend or colleague?'),
    _qLikert('I am satisfied with my job'),
    _qLikert('I am satisfied with my work-life balance'),
    _qLikert('I am satisfied with the support I receive from my manager'),
    _qLikert('I am satisfied with the opportunities I receive for my career growth'),
    _qLikert('I am satisfied with my compensation and benefits'),
    _qLikert('I am satisfied with the teamwork and collaboration in my department'),
    _qLikert('I am satisfied with the company culture and values'),
    _qLikert('I am satisfied with communication from leadership?'),
    _qLikert('I am satisfied with recognition and appreciation for your work?'),
  ]
  return _templatePayload('Annual Engagement Survey Template', 'Annual employee engagement survey', qs, 'Normal', { deleted_questions: [] })
}

async function _postTemplate(payload) {
  return api('/surveyms/create_template', { method: 'POST', body: JSON.stringify(payload) })
}
async function _fetchTemplatesByName(names) {
  const r = await api('/surveyms/get_template_for_org?is_reduced_data=false', {
    method: 'POST',
    body: JSON.stringify({ offset: 1, limit: 100, filters: { name: [], status: '', type: [], is_deleted: false }, sort: { sort_field: 'created_at', sort_order: 'desc' } }),
  })
  if (!r.ok) return { ok: false, message: `Fetch templates failed: ${r.status}` }
  const list = (r.data && (r.data.results || r.data.data)) || (Array.isArray(r.data) ? r.data : [])
  const found = {}
  for (const n of names) {
    const t = list.find(x => (x.name || x.template_name) === n)
    if (t) found[n] = t.id || t.template_id || t._id
  }
  return { ok: true, found }
}

// Step 1: Feedback — creates all 3 review templates + engagement template
export async function createFeedback() {
  const wantNames = ['Peer Reflection Template', 'Manager Reflection Template', 'Self Reflection Template']
  const created = []
  for (const tpl of [buildPeerTemplate(), buildManagerTemplate(), buildSelfTemplate()]) {
    const r = await _postTemplate(tpl)
    if (!r.ok) return { ok: false, message: `Failed "${tpl.name}": ${r.status}` }
    created.push(tpl.name)
  }
  const engTpl = buildEngagementTemplate()
  const re = await _postTemplate(engTpl)
  if (!re.ok) return { ok: false, message: `Failed "${engTpl.name}": ${re.status}` }
  created.push(engTpl.name)

  const lookup = await _fetchTemplatesByName([...wantNames, engTpl.name])
  if (lookup.ok) {
    state.reviewTemplateIds = Object.assign({}, state.reviewTemplateIds || {}, lookup.found)
    state.engagementTemplateId = lookup.found[engTpl.name]
    saveState()
  }
  return { ok: true, message: `Created ${created.length} templates: ${created.map(n => n.split(' ')[0]).join(', ')}` }
}

const FEEDBACK_TEXTS = [
  'Demonstrates a consistent commitment to quality, ownership, and professional excellence in daily responsibilities.',
  'Effectively balances multiple priorities while maintaining strong attention to detail and execution standards.',
  'Actively contributes to a collaborative team environment through open communication and constructive engagement.',
  'Approaches challenges with a thoughtful and analytical mindset, leading to practical and effective solutions.',
  'Shows reliability in meeting commitments and maintaining accountability across assigned responsibilities.',
  'Continuously identifies opportunities to improve processes, workflows, and overall operational effectiveness.',
  'Builds positive stakeholder relationships through trust, responsiveness, and professional collaboration.',
  'Adapts confidently to evolving priorities and changing business needs with a proactive attitude.',
  'Contributes meaningful insights and support that strengthen team performance and business outcomes.',
  'Demonstrates initiative in personal development and consistently seeks opportunities for continuous learning.',
];

// Step 2: Give Feedback — sends 6-7 feedbacks to workspace users
export async function giveFeedback() {
  const adminOrgUserId = getOrgUserIdFromJwt()

  // feedbackFor needs org_user_id (OKR workspace user ID), not auth user_id
  const seen = new Set(adminOrgUserId ? [adminOrgUserId] : [])
  const candidates = []

  for (const u of (state.users || [])) {
    if (candidates.length >= 7) break
    if (!u.org_user_id || seen.has(u.org_user_id)) continue
    seen.add(u.org_user_id)
    candidates.push({ full_name: u.full_name, org_user_id: u.org_user_id })
  }

  // Also check dummyUsers (org_user_id is stored there)
  for (const u of (state.dummyUsers || [])) {
    if (candidates.length >= 7) break
    if (!u.org_user_id || seen.has(u.org_user_id)) continue
    seen.add(u.org_user_id)
    candidates.push({ full_name: u.full_name, org_user_id: u.org_user_id })
  }

  // Supplement by fetching employees inline if not enough
  if (candidates.length < 6) {
    const r = await api('/um/accounts/employee/?page=1&page_size=20')
    if (r.ok) {
      for (const emp of searchResults(r)) {
        if (candidates.length >= 7) break
        const oid = emp.org_user?.id
        if (!oid || seen.has(oid)) continue
        seen.add(oid)
        candidates.push({ full_name: emp.user?.full_name, org_user_id: oid })
      }
    }
  }

  if (!candidates.length) {
    return { ok: false, message: 'No users found to give feedback to. Run "Add User" or "Bulk Upload User" first.' }
  }

  const created = []
  const failed = []

  for (let i = 0; i < candidates.length; i++) {
    const user = candidates[i]
    const feedback = FEEDBACK_TEXTS[i % FEEDBACK_TEXTS.length]
    const r = await api('/cf/api/v1/feedbacks', {
      method: 'POST',
      body: JSON.stringify({
        feedbackFor: [user.org_user_id],
        feedback: feedback,
        feedbackVisibility: 'RECIPIENT',
        linkedItems: { goals: [], competencies: [] },
      }),
    })
    if (r.ok) {
      created.push(user.full_name)
    } else {
      console.log(`[giveFeedback] failed for ${user.full_name}:`, r.status, r.text)
      failed.push(`${user.full_name} (${r.status})`)
    }
  }

  if (!created.length) {
    return { ok: false, message: `All feedbacks failed: ${failed.join(', ')}` }
  }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return {
    ok: true,
    message: `Gave feedback to ${created.length} users: ${created.join(', ')}${failNote}`,
  }
}
