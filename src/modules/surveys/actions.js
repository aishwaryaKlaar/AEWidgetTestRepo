import { api, getToken, getWorkspaceId, getOrgUserIdFromJwt, getAdminUserIdFromJwt } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { notImplemented, _uuid, searchResults, unwrapPayload, errorBodyText } from '../../core/helpers.js'
import { fetchGroups } from '../../utils/fetchGroups.js'

const _PERSONA_BASE = {
  data: [],
  persona_config: { SELF: false, L1_MANAGER: false, L2_MANAGER: false, DIRECT_REPORTS: false, DIRECT_REPORTS_OF_DIRECT_REPORTS: false, PRIMARY_MATRIX_MANAGER: false, SECONDARY_MATRIX_MANAGER: false, PEERS: false, STAKEHOLDERS: false },
}

function _likert(q) {
  return {
    id: _uuid(), is_required: true, label_visibility: true,
    comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {},
    hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE,
    question_type: 'multiple_choice', question: q,
    options: [
      { choice_name: 'Strongly Disagree', label: '1', weight: 1, opt_out: false },
      { choice_name: 'Disagree',          label: '2', weight: 2, opt_out: false },
      { choice_name: 'Neither',           label: '3', weight: 3, opt_out: false },
      { choice_name: 'Agree',             label: '4', weight: 4, opt_out: false },
      { choice_name: 'Strongly Agree',    label: '5', weight: 5, opt_out: false },
    ],
    has_comments: { is_visible: false, is_mandatory: false },
  }
}

function _openEnded(q) {
  return {
    id: _uuid(), is_required: true, label_visibility: true,
    comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {},
    hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE,
    question_type: 'only_text', question: q, options: [],
    has_comments: {},
  }
}

function _values() {
  return {
    id: _uuid(), is_required: true, label_visibility: true,
    comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {},
    hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE,
    question_type: 'multiple_choice',
    question: 'Which 2 values of the organization did they live up to the most and why?',
    options: [
      { choice_name: 'Bias for action',           label: '1', weight: 1, opt_out: false },
      { choice_name: 'Think deeply, act quickly', label: '2', weight: 2, opt_out: false },
      { choice_name: 'Customer obsession',        label: '3', weight: 3, opt_out: false },
      { choice_name: 'Default to trust',          label: '4', weight: 4, opt_out: false },
      { choice_name: 'Set benchmarks',            label: '5', weight: 5, opt_out: false },
      { choice_name: 'Run upwards',               label: '6', weight: 6, opt_out: false },
    ],
    has_comments: { is_visible: false, is_mandatory: false },
  }
}

function _excellence(q) {
  return {
    id: _uuid(), is_required: true, label_visibility: true,
    comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {},
    hide_question_in_pms_reports: false, persona_customization: _PERSONA_BASE,
    question_type: 'multiple_choice', question: q,
    options: [
      { choice_name: 'Does not meet expectations',   label: '1', weight: 1, opt_out: false },
      { choice_name: 'Partially meets expectations', label: '2', weight: 2, opt_out: false },
      { choice_name: 'Meets expectations',           label: '3', weight: 3, opt_out: false },
      { choice_name: 'Exceeds expectations',         label: '4', weight: 4, opt_out: false },
      { choice_name: 'Role model',                   label: '5', weight: 5, opt_out: false },
    ],
    has_comments: { is_visible: false, is_mandatory: false },
  }
}

function _tpl(name, desc, questions) {
  return {
    name, long_description: desc,
    short_description: desc.slice(0, 80),
    audience_description: null, created_by: null,
    has_persona_customization: false, id: '',
    org_id: getWorkspaceId(),
    questions, status: 'PUBLISHED', type: 'Normal',
  }
}

function _buildTemplates() {
  return [
    _tpl('Customer Centricity & External Value Delivery Audit',
      'Gauges client empathy, product quality standards, feedback integration, and alignment of internal metrics with customer outcomes.',
      [
        _openEnded('Describe a specific situation where your team went above and beyond to solve a critical customer or client pain point.'),
        _openEnded('What internal process or policy most frequently hinders your ability to deliver a seamless customer experience?'),
        _likert('Our team prioritizes decisions that create long-term value and satisfaction for our customers.'),
        _likert('Feedback from customers is consistently analyzed and incorporated into product or service improvements.'),
        _values(),
        _excellence('Commit to excellence: Anchor every workflow in user empathy and unyielding commitment to end-value delivery.'),
      ]),

    _tpl('Inclusion, Psychological Safety & Belonging Index',
      'Assesses openness to diverse perspectives, freedom to report mistakes, equitable growth opportunities, and inclusive leadership practices.',
      [
        _openEnded('Describe an instance where your team created an environment where everyone felt safe sharing dissenting ideas or owning mistakes.'),
        _openEnded('What specific action or cultural shift would most improve psychological safety and inclusion within your department?'),
        _likert('I feel safe taking calculated risks and expressing unconventional ideas without fear of negative repercussions.'),
        _likert('Diverse backgrounds and viewpoints are actively sought out and valued in team decision-making.'),
        _values(),
        _excellence('Commit to excellence: Cultivate high-trust environments where every voice is heard and leveraged for better outcomes.'),
      ]),

    _tpl('Continuous Learning & Professional Growth Diagnostic',
      'Measures upskilling opportunities, internal knowledge sharing, career progression pathways, and educational resource accessibility.',
      [
        _openEnded('Describe a recent opportunity provided by the organization that significantly expanded your skills or domain knowledge.'),
        _openEnded('What skill or capability gap currently exists in your team that requires better learning and development support?'),
        _likert('I am provided with adequate learning opportunities and tools to advance my professional capabilities.'),
        _likert('My career goals are supported through regular, actionable discussions with my leadership.'),
        _values(),
        _excellence('Commit to excellence: Pursue continuous mastery, embrace new skillsets, and share knowledge across the organization.'),
      ]),

    _tpl('Systems Scalability & Process Automation Survey',
      'Evaluates operational technical debt, repetitive manual friction, workflow automation maturity, and architectural scale preparedness.',
      [
        _openEnded('Provide an example of a process that was successfully automated or simplified to enhance operational efficiency.'),
        _openEnded('Which manual or repetitive administrative workflow currently consumes the most unnecessary team bandwith?'),
        _likert('Our core operational processes are designed to handle business growth without breaking or causing delivery delays.'),
        _likert('Leadership actively invests in automating repetitive tasks to free up team capacity for strategic work.'),
        _values(),
        _excellence('Commit to excellence: Build for long-term scalability, eliminate repetitive toil, and optimize systems continually.'),
      ]),

    _tpl('Governance, Risk Management & Integrity Benchmark',
      'Examines compliance adherence, ethical decision-making standards, risk proactive identification, and data security consciousness.',
      [
        _openEnded('Describe how your team recently balanced rapid delivery speed with strict security or regulatory compliance standards.'),
        _openEnded('Where do you see potential operational or compliance risks that the organization should address more proactively?'),
        _likert('Our organization maintains high ethical standards and zero tolerance for compromised integrity.'),
        _likert('Employees are empowered and encouraged to report compliance risks and operational vulnerabilities immediately.'),
        _values(),
        _excellence('Commit to excellence: Uphold uncompromising integrity, manage risk proactively, and deliver with institutional rigor.'),
      ]),

    _tpl('Performance Recognition & Total Rewards Feedback Pulse',
      'Captures perception of meritocracy, compensation transparency, performance assessment fairness, and holistic peer recognition.',
      [
        _openEnded('Describe a time when an exceptional contribution by you or a peer was recognized in a meaningful way.'),
        _openEnded('What change in the performance evaluation or recognition framework would make it feel more fair and transparent?'),
        _likert('High performance and extra-mile efforts are recognized and rewarded fairly across the organization.'),
        _likert('The criteria used to evaluate performance and determine career advancements are transparent and clear.'),
        _values(),
        _excellence('Commit to excellence: Foster a true meritocracy where impact is celebrated and standards remain high.'),
      ]),

    _tpl('Organizational Clarity & Resource Allocation Barometer',
      'Measures priority alignment, budget/bandwidth distribution, project scoping efficiency, and focus on strategic core bets.',
      [
        _openEnded('Describe a time when leadership made a difficult prioritization decision that helped your team focus on what truly mattered.'),
        _openEnded('What conflicting priorities or resource constraints currently prevent your team from executing at full potential?'),
        _likert('Resources, budget, and headcount are allocated effectively to support key strategic initiatives.'),
        _likert('Our team has a clear understanding of which projects take priority when trade-offs are necessary.'),
        _values(),
        _excellence('Commit to excellence: Focus resources on high-impact objectives and execute with clear strategic intentionality.'),
      ]),

    _tpl('Vendor, Ecosystem & Partner Synergy Review',
      'Gauges external vendor management efficiency, third-party integration quality, contract execution speed, and partner ecosystem alignment.',
      [
        _openEnded('Describe a successful initiative where an external partner or vendor integration significantly boosted internal performance.'),
        _openEnded('What friction points exist when collaborating with third-party vendors, suppliers, or external platforms?'),
        _likert('External vendor relationships and partner integrations are managed efficiently to meet business SLAs.'),
        _likert('Our organization selects and collaborates with external partners who uphold our standards of execution.'),
        _values(),
        _excellence('Commit to excellence: Extend high operational standards to external partnerships and maintain reliable ecosystem synergy.'),
      ]),
  ];
}

async function _postTemplate(payload) {
  return api('/surveyms/create_template', { method: 'POST', body: JSON.stringify(payload) })
}

// Step 1: Create Survey Template — creates 7 distinct survey templates
export async function createSurveyTemplate() {
  const templates = _buildTemplates()
  const created = [], failed = [], createdIds = []

  for (const tpl of templates) {
    const r = await _postTemplate(tpl)
    console.log(`[createSurveyTemplate] "${tpl.name}" → ${r.status}`, JSON.stringify(r.data)?.slice(0, 200))
    if (r.ok) {
      const id = r.data?.id || r.data?.data?.id
      created.push(tpl.name)
      if (id) createdIds.push(id)
    } else {
      const body = (r.text || '').toLowerCase()
      if (body.includes('exist')) {
        created.push(tpl.name)
        const existingId = r.data?.id || r.data?.data?.id
        if (existingId) createdIds.push(existingId)
      } else {
        failed.push(`${tpl.name} (${r.status})`)
      }
    }
  }

  if (!created.length) return { ok: false, message: `All templates failed: ${failed.join(', ')}` }

  if (createdIds.length) {
    state.surveyTemplateId = createdIds[0]
    state.surveyTemplateIds = createdIds
    saveState()
  }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} templates: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}

function _tpl360(name, desc, questions) {
  return {
    name, long_description: desc,
    short_description: desc.slice(0, 80),
    audience_description: null, created_by: null,
    has_persona_customization: false, id: '',
    org_id: getWorkspaceId(),
    questions, status: 'PUBLISHED', type: '360',
  }
}
function _build360Templates() {
  return [
    _tpl360('360° Strategic Alignment & Long-Term Horizon Audit',
      'Evaluates vision cascading, multi-year roadmap execution, goal prioritization, and alignment of tactical work with broad strategy.',
      [
        _openEnded('Describe a situation where this person successfully aligned their team\'s daily priorities with the company\'s multi-year strategic vision.'),
        _openEnded('Where should this person place greater focus when balancing immediate, urgent tasks against long-term strategic objectives?'),
        _likert('This person effectively translates overarching company strategy into clear, actionable priorities for their team.'),
        _likert('This person evaluates opportunities and trade-offs through the lens of long-term strategic value rather than short-term fixes.'),
        _likert('This person maintains strategic focus and prevents team derailment amidst shifting corporate or market priorities.'),
        _values(),
        _excellence('Commit to excellence: Anchor execution in strategic clarity, balance immediate wins with long-term vision, and cascade focus.'),
      ]),

    _tpl360('360° Crisis Leadership & Incident Response Composure Diagnostic',
      'Assesses operational calm under high pressure, rapid emergency decision-making, stakeholder communication during outages, and post-mortem execution.',
      [
        _openEnded('Provide an example of a high-stakes incident or operational crisis where this person demonstrated strong composure and decisive leadership.'),
        _openEnded('How could this person refine their delegation or communication approach during urgent, time-sensitive incidents?'),
        _likert('This person remains calm, decisive, and highly effective when managing unforeseen operational emergencies or critical outages.'),
        _likert('This person maintains transparent, timely communication with key stakeholders throughout high-pressure incidents.'),
        _likert('This person ensures thorough root-cause analysis is conducted following incidents to prevent systemic recurrence.'),
        _values(),
        _excellence('Commit to excellence: Lead with composure during crises, drive rapid resolution, and fortify long-term operational resilience.'),
      ]),

    _tpl360('360° Cross-Functional Synergy & Matrix Leadership Evaluation',
      'Measures non-hierarchical influence, lateral relationship building, silo breakdown, and collaborative alignment across business units.',
      [
        _openEnded('Describe an instance where this person successfully drove alignment and built momentum across partner teams without direct authority.'),
        _openEnded('What adjustment could this person make to build stronger collaborative relationships with lateral department leaders?'),
        _likert('This person actively breaks down operational silos to foster genuine, high-trust cross-functional partnerships.'),
        _likert('This person effectively influences decisions and outcomes across team boundaries without relying on hierarchical authority.'),
        _likert('This person balances their own department\'s goals against broader inter-departmental and company-wide interests.'),
        _values(),
        _excellence('Commit to excellence: Build lasting matrix relationships, break down organizational silos, and drive enterprise synergy.'),
      ]),

    _tpl360('360° Data Governance, Risk & Ethical Compliance Barometer',
      'Gauges commitment to data privacy, regulatory standards compliance, risk mitigation transparency, and ethical decision-making standards.',
      [
        _openEnded('Describe a scenario where this person championed regulatory compliance, data privacy, or ethical considerations during project planning.'),
        _openEnded('How can this person make their decision-making process even more transparent regarding security, compliance, or risk governance?'),
        _likert('This person consistently models high ethical standards, transparency, and integrity in all professional interactions.'),
        _likert('This person ensures team processes strictly comply with legal, regulatory, security, and internal governance standards.'),
        _likert('This person proactively identifies, flags, and mitigates operational and compliance risks before they escalate.'),
        _values(),
        _excellence('Commit to excellence: Uphold unyielding ethical standards, lead with transparency, and champion compliance integrity.'),
      ]),

    _tpl360('360° Commercial Acumen & ROI Realization Diagnostic',
      'Examines P&L awareness, resource efficiency optimization, value creation focus, and commercial rationale behind technical/operational investments.',
      [
        _openEnded('Describe a time when this person proposed or executed an initiative that generated tangible cost savings, revenue growth, or efficiency gains.'),
        _openEnded('Where can this person better evaluate the financial return or commercial impact before committing resources to a project?'),
        _likert('This person demonstrates a strong understanding of business financial drivers and aligns operations with value creation.'),
        _likert('This person rigorously evaluates the return on investment (ROI) and resource trade-offs for proposed initiatives.'),
        _likert('This person manages budget, time, and human resources with high accountability and fiscal discipline.'),
        _values(),
        _excellence('Commit to excellence: Maximize value creation, practice prudent resource allocation, and drive measurable return on investment.'),
      ]),
  ];
}
// Step 2: Create 360 Template — creates 5 distinct 360-type survey templates
export async function create360Template() {
  const templates = _build360Templates()
  const created = [], failed = [], createdIds = []

  for (const tpl of templates) {
    const r = await _postTemplate(tpl)
    console.log(`[create360Template] "${tpl.name}" → ${r.status}`, JSON.stringify(r.data)?.slice(0, 200))
    if (r.ok) {
      const id = r.data?.id || r.data?.data?.id
      created.push(tpl.name)
      if (id) createdIds.push(id)
    } else {
      const body = (r.text || '').toLowerCase()
      if (body.includes('exist')) {
        created.push(tpl.name)
        const existingId = r.data?.id || r.data?.data?.id
        if (existingId) createdIds.push(existingId)
      } else {
        failed.push(`${tpl.name} (${r.status})`)
      }
    }
  }

  if (!created.length) return { ok: false, message: `All 360 templates failed: ${failed.join(', ')}` }

  if (createdIds.length) {
    state.survey360TemplateId  = createdIds[0]
    state.survey360TemplateIds = createdIds
    saveState()
  }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 templates: ${created.map(n => n.split('°')[1]?.trim().split(' ')[0] || n.split(' ')[0]).join(', ')}${failNote}` }
}

const SURVEY_360_NAMES = [
  'Architectural Vision & Systemic Scale 360',
  'Strategic Negotiation & Vendor Governance 360',
  'Data Rigor & Quantitative Decision-Making 360',
  'User Empathy & Product Experience 360',
  'Talent Enablement & Peer Coaching 360',
];

// Step 3: Create 360 Survey — creates 5 360-type surveys via launch_multiple_survey
export async function create360Survey() {
  const adminId = getOrgUserIdFromJwt() || getAdminUserIdFromJwt() || state.adminOrgUserId || state.adminUserId
  if (!adminId) return { ok: false, message: 'Could not resolve admin user ID.' }

  // Always fetch 360 templates fresh, sorted oldest-first (pre-existing templates before automation ones)
  let templateIds = []
  {
    const r = await api('/surveyms/get_template_for_org?is_reduced_data=true', {
      method: 'POST',
      body: JSON.stringify({ offset: 1, limit: 50, filters: { name: [], status: ['PUBLISHED'], type: ['360'] }, sort: { sort_field: 'created_at', sort_order: 'asc' } }),
    })
    const raw = r.data
    const results = Array.isArray(raw?.data) ? raw.data
      : Array.isArray(raw?.results) ? raw.results
      : Array.isArray(raw?.data?.data) ? raw.data.data
      : []
    templateIds = results.map(t => t.id).filter(Boolean)
    console.log('[create360Survey] available 360 templates (oldest first):', results.map(t => t.id + ' ' + t.name))
  }
  if (!templateIds.length) return { ok: false, message: 'No 360 templates found. Run "Create 360 Template" first.' }

  // Fetch nominations and pick one where is_survey_linked is false
  const nr = await api('/survey/feedback-nomination/feedback-nomination/?offset=0&with_admins=True&limit=10&status=closed,paused,approvals_awaited,published,ready_to_publish')
  const nrPayload = unwrapPayload(nr)
  const nomList = Array.isArray(nrPayload?.results) ? nrPayload.results
    : Array.isArray(nrPayload) ? nrPayload
    : []
  console.log('[create360Survey] published nominations found:', nomList.length, nomList.map(n => n.id + ':' + n.status))

  // Find a usable nomination — iterate to find one with is_survey_linked: false
  let finalNominationId = null, nomFullData = {}, nomGroupIds = []
  const candidateList = [
    ...nomList.filter(n => n.id === state.nominationId),
    ...nomList.filter(n => n.id !== state.nominationId),
  ]
  for (const cand of candidateList) {
    const nf = await api(`/survey/feedback-nomination/feedback-nomination/${cand.id}/`)
    const nfd = unwrapPayload(nf) || {}
    console.log('[create360Survey] checking nomination:', cand.id, 'is_survey_linked:', nfd.is_survey_linked, 'status:', nfd.status)
    if (!nfd.is_survey_linked) {
      finalNominationId = cand.id
      nomFullData = nfd
      nomGroupIds = Array.isArray(nfd.nomination_group_ids) ? nfd.nomination_group_ids : []
      break
    }
  }
  if (!finalNominationId) {
    return { ok: false, message: 'All nominations are already survey-linked. Run "Create Nomination" to make new ones.' }
  }
  state.nominationId = finalNominationId
  saveState()
  console.log('[create360Survey] using nomination:', finalNominationId, 'group_ids:', nomGroupIds)

  const startAt = new Date().toISOString()
  const endAt   = new Date(Date.now() + 7 * 86400000).toISOString()
  const created = [], failed = []

  for (let i = 0; i < SURVEY_360_NAMES.length; i++) {
    const name       = SURVEY_360_NAMES[i]
    const templateId = templateIds[i % templateIds.length]

    if (!templateId) {
      failed.push(`${name} (no template)`)
      continue
    }

    const payload = {
      data: {
        start_at: startAt,
        end_at: endAt,
        name,
        survey_admins: [adminId],
        template_id: templateId,
        send_email_notification: false,
        send_gchat_notification: false,
        send_slack_notification: false,
        is_anonymous: false,
        is_skippable: false,
        skip_survey_comment: '',
        description: '',
        reminders: [],
        feedback_request_for_part_time: false,
        feedback_request_from_part_time: false,
        is_flat_survey: true,
        introduction: { file: { name: '', s3_object_key: '' }, config: false, content: '' },
        nomination_id: finalNominationId,
        survey_groups: [{
          survey_group_name: name,
          group_audience_id: [],
          audience_members: [],
          description: '',
          survey_for: '',
          respondents: [],
        }],
      },
    }

    console.log(`[create360Survey] "${name}" payload:`, JSON.stringify(payload))

    const r = await api('/surveyms/launch_multiple_survey', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    // If CORS-blocked (status 0), use server-side proxy to capture actual Django error body
    if (r.status === 0) {
      try {
        const proxyRes = await fetch(`${import.meta.env.VITE_PROXY_BASE || ''}/api/klaar_proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth: 'Bearer ' + getToken(),
            workspaceId: getWorkspaceId(),
            clientDomain: location.host,
            body: payload,
          }),
        })
        const pd = await proxyRes.json()
        console.warn(`[create360Survey] PROXY klaar_status=${pd.klaar_status} body:`, JSON.stringify(pd.data)?.slice(0, 3000))
      } catch (pe) {
        console.error('[create360Survey] proxy call failed:', pe.message)
      }
    }

    console.log(`[create360Survey] "${name}" status:`, r.status, 'body:', r.text)

    if (r.ok) {
      created.push(name)
      console.log(`[create360Survey] "${name}" launched OK`)
    } else {
      const body = (r.text || '').toLowerCase()
      if (body.includes('exist')) created.push(name)
      else { console.warn(`[create360Survey] "${name}" FAILED status=${r.status} body=${r.text}`); failed.push(`${name} (${r.status})`); break }
    }
  }

  if (!created.length) return { ok: false, message: `All 360 surveys failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 surveys: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}

const REPORT_360_NAMES = [
  'Leadership 360 Report',
  'Cross-Functional 360 Report',
  'Execution Excellence 360 Report',
  'Growth Mindset 360 Report',
  'Communication 360 Report',
]

// Step 4: Create 360 Report — create_system_report → link template+survey → publish
export async function create360Report() {
  // Get 360 template IDs
  let templateIds = state.survey360TemplateIds || (state.survey360TemplateId ? [state.survey360TemplateId] : [])
  if (!templateIds.length) {
    const r = await api('/surveyms/get_template_for_org?is_reduced_data=true', {
      method: 'POST',
      body: JSON.stringify({ offset: 1, limit: 50, filters: { name: [], status: ['PUBLISHED'], type: ['360'] }, sort: { sort_field: 'created_at', sort_order: 'desc' } }),
    })
    const raw = r.data
    const results = Array.isArray(raw?.data) ? raw.data
      : Array.isArray(raw?.results) ? raw.results
      : Array.isArray(raw?.data?.data) ? raw.data.data
      : []
    templateIds = results.map(t => t.id).filter(Boolean)
    if (templateIds.length) { state.survey360TemplateIds = templateIds; state.survey360TemplateId = templateIds[0]; saveState() }
  }
  if (!templateIds.length) return { ok: false, message: 'No 360 templates found. Run "Create 360 Template" first.' }

  const created = [], failed = []

  for (let i = 0; i < Math.min(REPORT_360_NAMES.length, templateIds.length); i++) {
    const reportName = REPORT_360_NAMES[i]
    const templateId = templateIds[i]

    // Step 1: Create system report
    const r1 = await api('/surveyms/create_system_report', {
      method: 'POST',
      body: JSON.stringify({ name: reportName }),
    })
    console.log(`[create360Report] create "${reportName}":`, r1.status, JSON.stringify(r1.data)?.slice(0, 200))
    if (!r1.ok) { failed.push(`${reportName} (create ${r1.status})`); continue }

    const srId = r1.data?.id || r1.data?.data?.id || r1.data?.sr_id || r1.data?.data?.sr_id
    if (!srId) { console.warn('[create360Report] no sr_id in response:', JSON.stringify(r1.data)); failed.push(`${reportName} (no sr_id)`); continue }

    // Step 2: Get survey groups for this template
    const r2 = await api(`/surveyms/get_survey_group_from_template?template_id=${templateId}`)
    const sgList = Array.isArray(r2.data?.data) ? r2.data.data : Array.isArray(r2.data) ? r2.data : []
    const sg = sgList.find(s => s.status === 'Active') || sgList[0]
    console.log(`[create360Report] survey group for template ${templateId}:`, sg?.id, sg?.status)

    // Step 3: Link template + survey group to report
    await api(`/surveyms/update_system_report?sr_id=${srId}`, {
      method: 'PATCH',
      body: JSON.stringify({ template_id: templateId }),
    })
    if (sg?.id) {
      await api(`/surveyms/update_system_report?sr_id=${srId}`, {
        method: 'PATCH',
        body: JSON.stringify({ survey_group_id: sg.id }),
      })
    }

    // Step 4: Publish report
    const r3 = await api(`/surveyms/publish_system_report?sr_id=${srId}`)
    console.log(`[create360Report] publish "${reportName}":`, r3.status, JSON.stringify(r3.data)?.slice(0, 100))

    if (r3.ok) created.push(reportName)
    else failed.push(`${reportName} (publish ${r3.status})`)
  }

  if (!created.length) return { ok: false, message: `All reports failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 reports: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}

const SURVEY_NAMES = [
  'Organizational Agility & Change Readiness Survey',
  'Customer Value & Operational Craftsmanship Audit',
  'Psychological Safety & Workplace Inclusion Pulse',
  'Systems Scalability & Tooling Efficacy Diagnostic',
  'Talent Enablement & Continuous Growth Assessment',
];

// Step 4: Create Survey — creates 5 engagement surveys and publishes them
export async function createSurvey() {
  const adminId = getOrgUserIdFromJwt() || getAdminUserIdFromJwt() || state.adminOrgUserId || state.adminUserId
  if (!adminId) return { ok: false, message: 'Could not resolve admin user ID from session.' }

  let templateIds = state.surveyTemplateIds || (state.surveyTemplateId ? [state.surveyTemplateId] : [])

  // Fallback: fetch templates via the correct POST endpoint
  if (!templateIds.length) {
    const r = await api('/surveyms/get_template_for_org?is_reduced_data=false', {
      method: 'POST',
      body: JSON.stringify({ offset: 1, limit: 50, filters: { name: [], status: ['PUBLISHED'], type: ['Normal'] }, sort: { sort_field: 'created_at', sort_order: 'desc' } }),
    })
    const raw = r.data
    console.log('[createSurvey] template fetch status:', r.status, 'raw:', JSON.stringify(raw)?.slice(0, 300))
    const results = Array.isArray(raw?.data) ? raw.data
      : Array.isArray(raw?.results) ? raw.results
      : Array.isArray(raw?.data?.data) ? raw.data.data
      : []
    templateIds = results.map(t => t.id).filter(Boolean)
    console.log('[createSurvey] templateIds from API:', templateIds.length)
    if (templateIds.length) {
      state.surveyTemplateIds = templateIds
      state.surveyTemplateId  = templateIds[0]
      saveState()
    }
  }

  if (!templateIds.length) return { ok: false, message: 'No survey templates found. Run "Create Survey Template" first.' }

  if (!(state.groups || []).some(g => g.id)) {
    await fetchGroups()
  }
  const groups = (state.groups || []).filter(g => g.id)
  if (!groups.length) return { ok: false, message: 'No groups found in workspace. Create groups first.' }

  const created = [], failed = []

  for (let i = 0; i < SURVEY_NAMES.length; i++) {
    const name       = SURVEY_NAMES[i]
    const templateId = templateIds[i % templateIds.length]
    const groupId    = groups[i % groups.length].id

    // 1. Create survey
    const r1 = await api('/surveyms/create_normal_survey', {
      method: 'POST',
      body: JSON.stringify({ name, survey_admins: [adminId] }),
    })
    if (!r1.ok) { failed.push(`${name} (${r1.status})`); continue }

    const nsId = r1.data?.id || r1.data?.ns_id || r1.data?.data?.id
    if (!nsId) { failed.push(`${name} (no id)`); continue }

    // 2. Set type
    await api(`/surveyms/update_normal_survey?ns_id=${nsId}`, {
      method: 'PATCH',
      body: JSON.stringify({ type: 'normal' }),
    })

    // 3. Set template
    await api(`/surveyms/update_normal_survey?ns_id=${nsId}`, {
      method: 'PATCH',
      body: JSON.stringify({ template_id: templateId }),
    })

    // 4. Set audience
    await api(`/surveyms/update_normal_survey?ns_id=${nsId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        respondents_list_config: {
          groups: [groupId],
          individual_users: [],
          audience_rules: [],
          csv_uploaded_users: [],
          file: { name: '', s3_object_key: '' },
        },
      }),
    })

    // 5+6. Set timeline (two patches — first without end, then with end)
    const startAt = new Date().toISOString()
    const endAt   = new Date(Date.now() + 35 * 86400000).toISOString()

    await api(`/surveyms/update_normal_survey?ns_id=${nsId}`, {
      method: 'PATCH',
      body: JSON.stringify({ start_at: startAt, end_at: null, reminders: [] }),
    })
    await api(`/surveyms/update_normal_survey?ns_id=${nsId}`, {
      method: 'PATCH',
      body: JSON.stringify({ start_at: startAt, end_at: endAt, reminders: [] }),
    })

    // 7. Publish
    await api(`/surveyms/publish_normal_survey?ns_id=${nsId}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'Published' }),
    })

    created.push(name)
    console.log(`[createSurvey] "${name}" published (ns_id=${nsId})`)
  }

  if (!created.length) return { ok: false, message: `All surveys failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} surveys: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}

const NOMINATION_NAMES = [
  'Beacon of Integrity Distinction',
  'Mastery in Innovation Award',
  'Unsung Hero Recognition',
  'Customer Success Champion Honor',
  'Pioneer of Sustainability Tribute',
  'Empowerment & Inclusion Vanguard',
  'Systems Synergy & Scaling Award',
];
// Step 3: Create Nomination — creates 7 feedback nominations linked to groups
export async function createNomination() {
  const adminId = getOrgUserIdFromJwt() || getAdminUserIdFromJwt() || state.adminOrgUserId || state.adminUserId
  if (!adminId) return { ok: false, message: 'Could not resolve admin user ID from session.' }

  if (!(state.groups || []).some(g => g.id)) {
    await fetchGroups()
  }
  const groups = (state.groups || []).filter(g => g.id)
  if (!groups.length) return { ok: false, message: 'No groups found in workspace. Create groups first.' }

  // Resolve one other org user (besides the admin) so each nomination can be finalized
  // with a non-zero audience — without this, "audience" stays 0 and the linked survey has no respondents.
  let otherUserId = null
  {
    const ur = await api('/um/accounts/employee/?page=1&page_size=20&get_disabled=true&filter=%5B%5D')
    const emp = searchResults(ur).find(e => e.org_user?.id && e.org_user.id !== adminId)
    otherUserId = emp?.org_user?.id || null
    console.log('[createNomination] otherUserId for finalizing:', otherUserId)
  }

  const endDate = new Date(Date.now() + 14 * 86400000).toISOString()

  const _nomSettings = (name, nomGroupIds, extra = {}) => ({
    name,
    nomination_group_ids: nomGroupIds,
    end_date: endDate,
    allow_notifications: true,
    auto_close_enabled: false,
    respondent_status_enabled: false,
    hrbp_add_participants_enabled: false,
    total_min_respondents: 1,
    total_max_respondents: 100,
    team_min_respondents: 2,
    team_max_respondents: 20,
    peer_min_respondents: 2,
    peer_max_respondents: 20,
    stakeholder_min_respondents: 2,
    stakeholder_max_respondents: 20,
    is_team_max_enabled: true,
    is_peer_max_enabled: true,
    is_stakeholder_max_enabled: true,
    is_total_max_enabled: true,
    peers_category: 'mandatory',
    stakeholders_category: 'mandatory',
    reminders: [],
    approver_settings: { approval_required_from: 'none', approver_action: 'back_to_participant' },
    completion_criteria: {
      participant: false, manager_limit: 0, manager: false, manager_l2: false,
      primary_matrix_manager: false, secondary_matrix_manager: false,
      team_limit: 0, direct_reports: 0, direct_report_of_direct_report: 0, peers: 0, stakeholders: 0,
    },
    settings: {
      participant: { enabled: true, override: false },
      participant_manager: { enabled: true, override: false },
      participant_manager_l2: { enabled: true, override: false },
      participant_primary_matrix_manager: { enabled: true, override: false },
      participant_secondary_matrix_manager: { enabled: true, override: false },
      participant_direct_reports: { enabled: true, override: false },
      participant_direct_report_of_direct_report: { enabled: true, override: false },
      participant_peers: { enabled: true, override: true },
      participant_stakeholders: { enabled: false, override: true },
    },
    ...extra,
  })

  const created = [], failed = [], createdNomIds = []
  for (let i = 0; i < NOMINATION_NAMES.length; i++) {
    const name = NOMINATION_NAMES[i]
    const g1 = groups[i % groups.length].id
    const g2 = groups[(i + 1) % groups.length].id
    const nomGroupIds = g1 === g2 ? [g1] : [g1, g2]

    // Step 1: Create
    const r = await api('/survey/feedback-nomination/feedback-nomination/', {
      method: 'POST',
      body: JSON.stringify({ name, admin_ws_user_ids: [adminId], nomination_group_ids: nomGroupIds }),
    })
    if (!r.ok) {
      const body = errorBodyText(r)
      if (body.includes('exist')) created.push(name)
      else failed.push(`${name} (${r.status})`)
      continue
    }
    const nomId = unwrapPayload(r)?.id
    if (!nomId) { failed.push(`${name} (no id)`); continue }
    createdNomIds.push(nomId)

    // Step 2: Submit with full settings — kicks off background audience-populate task
    const subR = await api(`/survey/feedback-nomination/feedback-nomination/${nomId}/`, {
      method: 'PATCH',
      body: JSON.stringify(_nomSettings(name, nomGroupIds, { submit: true })),
    })
    console.log(`[createNomination] submit ${nomId}:`, subR.status, unwrapPayload(subR)?.status)
    const approverSettingsId = unwrapPayload(subR)?.approver_settings?.id

    // Step 3: Poll until ready_to_publish (background task may take a few seconds)
    let ready = false
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(res => setTimeout(res, 2000))
      const sr = await api(`/survey/feedback-nomination/feedback-nomination/${nomId}/?only=status`)
      const st = unwrapPayload(sr)?.status
      console.log(`[createNomination] poll ${nomId} attempt ${attempt + 1}:`, st)
      if (st === 'ready_to_publish') { ready = true; break }
    }

    // Step 4: Add admin (+ one other user) as participants — lets the demo be run entirely
    // in the current session instead of needing a second account login.
    const participantIds = otherUserId ? [adminId, otherUserId] : [adminId]
    const addR = await api(`/survey/feedback-nomination/add-participants/${nomId}/`, {
      method: 'POST',
      body: JSON.stringify({ participants: participantIds }),
    })
    const addPayload = unwrapPayload(addR)
    console.log(`[createNomination] add-participants ${nomId}:`, addR.status, JSON.stringify(addPayload)?.slice(0, 200))
    const nomRequestIds = (Array.isArray(addPayload) ? addPayload : []).map(d => d.id).filter(Boolean)

    if (nomRequestIds.length) {
      const subPartR = await api(`/survey/feedback-nomination/add-participants/${nomId}/`, {
        method: 'POST',
        body: JSON.stringify({ nom_requests: nomRequestIds, submit: true }),
      })
      console.log(`[createNomination] submit participants ${nomId}:`, subPartR.status, unwrapPayload(subPartR))
    }

    // Step 5: Publish
    const pubSettings = _nomSettings(name, nomGroupIds, { publish: true })
    if (approverSettingsId) pubSettings.approver_settings = { ...pubSettings.approver_settings, id: approverSettingsId }
    const pubR = await api(`/survey/feedback-nomination/feedback-nomination/${nomId}/`, {
      method: 'PATCH',
      body: JSON.stringify(pubSettings),
    })
    console.log(`[createNomination] publish ${nomId}:`, pubR.status, unwrapPayload(pubR)?.status)

    // Step 6: Finalise the admin's request + one other participant's request so the
    // nomination has a non-zero audience once it's linked to a survey.
    for (const reqId of nomRequestIds) {
      const finR = await api(`/survey/feedback-nomination/requests/${reqId}/finalise/`, { method: 'POST' })
      console.log(`[createNomination] finalise ${reqId}:`, finR.status, unwrapPayload(finR)?.status)
    }

    // Step 7: Save — resave settings (no submit/publish flag) to reflect the finalised state
    const finalApproverId = unwrapPayload(pubR)?.approver_settings?.id || approverSettingsId
    const saveSettings = _nomSettings(name, nomGroupIds)
    if (finalApproverId) saveSettings.approver_settings = { ...saveSettings.approver_settings, id: finalApproverId }
    const saveR = await api(`/survey/feedback-nomination/feedback-nomination/${nomId}/`, {
      method: 'PATCH',
      body: JSON.stringify(saveSettings),
    })
    console.log(`[createNomination] save ${nomId}:`, saveR.status, unwrapPayload(saveR)?.status)

    created.push(name)
  }

  if (!created.length) return { ok: false, message: `All nominations failed: ${failed.join(' | ')}` }

  if (createdNomIds.length) {
    state.nominationId  = createdNomIds[0]
    state.nominationIds = createdNomIds
    saveState()
  }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} nominations: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}

// Step 4: Create Report
export const createReport = notImplemented('Fetch /surveyms/reports/ for survey results')
