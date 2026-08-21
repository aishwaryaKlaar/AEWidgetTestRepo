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
    _tpl('Developer Experience, Tooling & Engineering Velocity Audit',
      'Assesses local development environments, build and CI/CD efficiency, toolchain friction, and deployment autonomy.',
      [
        _openEnded('Describe a recent tooling enhancement or automation that noticeably reduced your daily development friction.'),
        _openEnded('Which legacy system, slow pipeline, or approval bottleneck most severely limits your team\'s engineering velocity?'),
        _likert('Our team has modern, reliable development tools and infrastructure to ship high-quality code rapidly.'),
        _likert('Automated testing and CI/CD pipelines provide fast, dependable feedback without excessive manual gates.'),
        _values(),
        _excellence('Commit to excellence: Streamline engineering workflows, eliminate toil, and maximize developer velocity.'),
      ]),

    _tpl('Total Rewards, Compensation Clarity & Career Mobility Sentiment Pulse',
      'Measures transparency around compensation bands, merit recognition fairness, promotional pathways, and benefit satisfaction.',
      [
        _openEnded('Share an example where compensation, promotion, or merit criteria were communicated with exceptional clarity.'),
        _openEnded('What specific area of career progression or reward transparency requires clearer guidelines from people leadership?'),
        _likert('The criteria for career progression, leveling benchmarks, and promotional milestones are transparent and fair.'),
        _likert('Our total rewards and recognition programs accurately reflect individual contributions and market standards.'),
        _values(),
        _excellence('Commit to excellence: Champion equitable recognition, transparent mobility benchmarks, and rewarding growth.'),
      ]),

    _tpl('Customer Empathy, Product-Led Growth & Value Realization Diagnostic',
      'Evaluates user feedback loops, customer obsession across non-product functions, product telemetry usage, and time-to-value metrics.',
      [
        _openEnded('Describe an instance where direct customer feedback or telemetry led to a pivot in project priorities.'),
        _openEnded('Where is our organization currently most disconnected from the day-to-day pain points of our end users?'),
        _likert('Our team consistently validates assumptions against direct user research, customer interviews, and behavioral telemetry.'),
        _likert('Delivering measurable value and solving core customer pain points takes precedence over vanity delivery metrics.'),
        _values(),
        _excellence('Commit to excellence: Anchor every initiative in authentic customer empathy and measurable end-user value.'),
      ]),

    _tpl('Operational Resilience, Incident Response & Crisis Preparedness Barometer',
      'Assesses disaster recovery readiness, blameless post-mortem culture, incident communication protocols, and operational hardening.',
      [
        _openEnded('Describe a recent outage or high-pressure operational incident that was resolved effectively through team coordination.'),
        _openEnded('What systemic single point of failure or operational gap poses the biggest risk to our service continuity?'),
        _likert('Our organization conducts blameless, thorough root-cause post-mortems to systematically prevent incident recurrence.'),
        _likert('Clear playbooks, escalation paths, and monitoring guardrails exist for managing critical operational emergencies.'),
        _values(),
        _excellence('Commit to excellence: Fortify platform resilience, embrace blameless learning, and lead calmly through operational crises.'),
      ]),

    _tpl('Inclusive Culture, Psychological Safety & Team Belonging Diagnostic',
      'Measures openness to unconventional ideas, speaking up without fear of retaliation, equitable growth opportunities, and inclusive leadership.',
      [
        _openEnded('Describe a scenario where a team member felt empowered to challenge an established decision or raise a contrarian viewpoint.'),
        _openEnded('What structural dynamic or cultural habit currently discourages team members from speaking up candidly?'),
        _likert('Team members feel safe taking calculated risks, voicing dissenting perspectives, and learning openly from failures.'),
        _likert('Diverse voices and varied perspectives are actively solicited and respected during critical planning sessions.'),
        _values(),
        _excellence('Commit to excellence: Foster high-trust psychological safety, empower diverse viewpoints, and champion inclusive growth.'),
      ]),

    _tpl('Vendor Governance, Sourcing Efficiency & SaaS Spend Discipline Benchmark',
      'Evaluates third-party software utilization, supplier risk management, procurement agility, and commercial contract oversight.',
      [
        _openEnded('Provide an example of an external vendor integration or contract negotiation that delivered high ROI for your group.'),
        _openEnded('Which third-party software tool or external agency partnership is currently underutilized or creating unnecessary overhead?'),
        _likert('Our procurement and vendor onboarding processes are streamlined, transparent, and security-compliant.'),
        _likert('Our department actively monitors SaaS tool utilization and eliminates redundant software licenses.'),
        _values(),
        _excellence('Commit to excellence: Optimize external partnerships, enforce prudent SaaS spend, and maintain vendor rigor.'),
      ]),

    _tpl('Asynchronous Work, Meeting Hygiene & Knowledge Management Index',
      'Gauges documentation quality, meeting overload reduction, asynchronous decision-making maturity, and centralized knowledge discovery.',
      [
        _openEnded('Describe an initiative where effective documentation or asynchronous communication replaced the need for recurring meetings.'),
        _openEnded('What recurring meeting or fragmented communication channel generates the greatest drain on your deep-focus time?'),
        _likert('Our team relies on well-structured documentation and async collaboration before scheduling synchronous meetings.'),
        _likert('Internal documentation, architectural decisions, and project knowledge are easy to locate, accurate, and up to date.'),
        _values(),
        _excellence('Commit to excellence: Cultivate intentional meeting hygiene, protect deep focus, and champion rigorous async documentation.'),
      ]),

    _tpl('Security Hygiene, Data Privacy & Regulatory Compliance Pulse',
      'Assesses adherence to security protocols, data classification awareness, privacy-by-design principles, and audit readiness.',
      [
        _openEnded('Describe how your team successfully balanced strict security or data privacy constraints with rapid delivery timelines.'),
        _openEnded('What security compliance workflow or access request process currently creates the most operational drag for your team?'),
        _likert('Security and data protection standards are embedded into our planning rather than treated as an afterthought.'),
        _likert('Team members receive clear guidance on data residency, access governance, and regional regulatory compliance.'),
        _values(),
        _excellence('Commit to excellence: Embed unyielding security standards, respect user privacy, and maintain flawless compliance integrity.'),
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
    _tpl360('360° Innovation Velocity & Experimentation Mindset',
      'Assesses appetite for calculated risk-taking, rapid prototyping culture, learning from failure, and creative problem-solving agility.',
      [
        _openEnded('Describe a project where this person introduced an unconventional solution or challenged established practices to drive innovation.'),
        _openEnded('How could this person better encourage iterative experimentation while maintaining baseline operational predictability?'),
        _likert('This person actively champions creative problem-solving and encourages teams to explore novel approaches.'),
        _likert('This person treats project setbacks as actionable learning opportunities rather than assignable blame.'),
        _likert('This person moves swiftly from conceptual ideas to low-fidelity prototypes to validate key assumptions early.'),
        _values(),
        _excellence('Commit to excellence: Cultivate bold curiosity, de-risk ideas through fast iteration, and turn insights into breakthroughs.'),
      ]),

    _tpl360('360° Operational Simplicity & Friction Reduction Index',
      'Measures dedication to eliminating bureaucratic waste, streamlining complex handoffs, simplifying workflows, and maximizing output velocity.',
      [
        _openEnded('Give an example of a workflow, process, or handoff that this person significantly simplified or de-cluttered.'),
        _openEnded('Where does this person introduce unnecessary complexity or administrative overhead in day-to-day coordination?'),
        _likert('This person proactively audits recurring processes to eliminate redundant approval steps and operational drag.'),
        _likert('This person communicates expectations, requirements, and directives with crisp clarity and zero ambiguity.'),
        _likert('This person designs scalable workflows that make it exceptionally easy for colleagues to execute independently.'),
        _values(),
        _excellence('Commit to excellence: Relentlessly remove operational friction, streamline systems, and champion radical simplicity.'),
      ]),

    _tpl360('360° Stakeholder Trust & Executive Transparency Audit',
      'Evaluates authentic communication, proactive bad-news management, boundary setting, and bidirectional credibility with senior stakeholders.',
      [
        _openEnded('Describe how this person handled a sensitive or difficult conversation with executive leadership or major stakeholders.'),
        _openEnded('In what scenarios could this person be more proactive in flagging project roadblocks or shifting expectations?'),
        _likert('This person communicates bad news, risks, and blockers early and transparently without sugarcoating.'),
        _likert('This person establishes strong credibility by consistently delivering against commitments made to senior leadership.'),
        _likert('This person navigates conflicting stakeholder priorities with diplomacy while maintaining objective project boundaries.'),
        _values(),
        _excellence('Commit to excellence: Build unshakeable stakeholder trust through unwavering candor, proactive transparency, and follow-through.'),
      ]),

    _tpl360('360° Continuous Feedback & Growth Coaching Diagnostic',
      'Gauges the frequency, specificity, and receptivity of real-time coaching, constructive feedback delivery, and reciprocal feedback seeking.',
      [
        _openEnded('Share an instance where this person delivered actionable, high-impact feedback that helped a peer or direct report level up.'),
        _openEnded('How effectively does this person receive, process, and act upon critical feedback provided by others?'),
        _likert('This person delivers timely, constructive, and empathetic feedback in the flow of daily work.'),
        _likert('This person visibly models humility by actively soliciting critical input on their own leadership and performance.'),
        _likert('This person partners with colleagues to co-create actionable development plans based on real-time feedback loops.'),
        _values(),
        _excellence('Commit to excellence: Accelerate growth through continuous feedback loops, high self-awareness, and relentless coaching.'),
      ]),

    _tpl360('360° Enterprise Systems Thinking & Dependency Governance',
      'Examines cross-system architectural awareness, proactive ripple-effect management, dependency decoupling, and whole-organization awareness.',
      [
        _openEnded('Describe a complex initiative where this person successfully mapped and mitigated hidden dependencies across multiple domains.'),
        _openEnded('How could this person better anticipate downstream consequences when rolling out major process or technical changes?'),
        _likert('This person evaluates local optimizations through the lens of overall enterprise architecture and system health.'),
        _likert('This person proactively identifies and decouples cross-team dependencies before they manifest as critical blockers.'),
        _likert('This person balances deep functional expertise with a wide, holistic view of the entire organizational ecosystem.'),
        _values(),
        _excellence('Commit to excellence: Think in whole systems, anticipate cross-domain ripple effects, and engineer resilient architectures.'),
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
  'Innovation Velocity & Experimentation Mindset 360',
  'Operational Simplicity & Friction Reduction 360',
  'Stakeholder Trust & Executive Transparency 360',
  'Continuous Feedback & Growth Coaching 360',
  'Systems Thinking & Dependency Governance 360',
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
  'Operational Resilience & Crisis Leadership 360 Report',
  'Strategic Vision & Horizon Alignment 360 Report',
  'Governance, Risk Integrity & Ethical Leadership 360 Report',
  'Commercial Acumen & Fiscal Stewardship 360 Report',
  'Continuous Feedback & Capability Coaching 360 Report',
];

// Step 4: Create 360 Report — create_system_report → search 360 templates → get that
// template's survey group → link both in a single update_system_report PATCH → publish.
export async function create360Report() {
  const created = [], failed = []

  for (let i = 0; i < REPORT_360_NAMES.length; i++) {
    const reportName = REPORT_360_NAMES[i]

    // Step 1: Create system report
    const r1 = await api('/surveyms/create_system_report', {
      method: 'POST',
      body: JSON.stringify({ name: reportName }),
    })
    console.log(`[create360Report] create "${reportName}":`, r1.status, JSON.stringify(r1.data)?.slice(0, 200))
    if (!r1.ok) { failed.push(`${reportName} (create ${r1.status})`); continue }

    const srId = r1.data?.id || r1.data?.data?.id || r1.data?.sr_id || r1.data?.data?.sr_id
    if (!srId) { console.warn('[create360Report] no sr_id in response:', JSON.stringify(r1.data)); failed.push(`${reportName} (no sr_id)`); continue }

    // Step 2: Search 360-type templates for this org
    const r2 = await api('/surveyms/get_template_for_org?is_reduced_data=true', {
      method: 'POST',
      body: JSON.stringify({ offset: 1, filters: { type: '360', name: [''] }, is_reduced_data: true }),
    })
    const templates = Array.isArray(r2.data?.data) ? r2.data.data
      : Array.isArray(r2.data?.results) ? r2.data.results
      : Array.isArray(r2.data?.data?.data) ? r2.data.data.data
      : []
    const template = templates.length ? templates[i % templates.length] : null
    if (!template?.id) { failed.push(`${reportName} (no 360 template found)`); continue }
    console.log(`[create360Report] using template for "${reportName}":`, template.id, template.name)

    // Step 3: Get the survey group(s) available for that template
    const r3 = await api(`/surveyms/get_survey_group_from_template?template_id=${template.id}`)
    const sgList = Array.isArray(r3.data?.data) ? r3.data.data : Array.isArray(r3.data) ? r3.data : []
    const sg = sgList.find(s => s.status === 'Active') || sgList[0]
    console.log(`[create360Report] survey group for template ${template.id}:`, sg?.id, sg?.status)
    if (!sg?.id) { failed.push(`${reportName} (no survey group for template)`); continue }

    // Step 4: Link template + survey group to the report — one PATCH, matching the
    // real payload shape: template as {id, name}, selected_survey_groups as an array.
    const r4 = await api(`/surveyms/update_system_report?sr_id=${srId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        template: { id: template.id, name: template.name },
        selected_survey_groups: [sg.id],
      }),
    })
    console.log(`[create360Report] update "${reportName}":`, r4.status, JSON.stringify(r4.data)?.slice(0, 200))
    if (!r4.ok) { failed.push(`${reportName} (update ${r4.status})`); continue }

    // Step 5: Publish report
    const r5 = await api(`/surveyms/publish_system_report?sr_id=${srId}`)
    console.log(`[create360Report] publish "${reportName}":`, r5.status, JSON.stringify(r5.data)?.slice(0, 100))

    if (r5.ok) created.push(reportName)
    else failed.push(`${reportName} (publish ${r5.status})`)
  }

  if (!created.length) return { ok: false, message: `All reports failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 reports: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}

const SURVEY_NAMES = [
  'Developer Velocity & Engineering Friction Audit',
  'Total Rewards & Career Mobility Sentiment Pulse',
  'Product-Led Growth & Customer Empathy Diagnostic',
  'Operational Resilience & Crisis Preparedness Barometer',
  'Innovation Culture & Psychological Safety Survey',
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
  'Architect of Continuous Improvement',
  'Champion of Collaborative Velocity',
  'Frontier Problem Solver Honor',
  'Guardian of Organizational Trust',
  'Transformational Mentorship Award',
  'Excellence in Precision & Craft Distinction',
  'Strategic Horizon Builder Tribute',
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
