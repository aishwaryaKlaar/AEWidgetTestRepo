// Surveys-module-specific shared helpers, scoped to just the 360 flow (per the user's
// request: Create 360 Template, Create 360 Nomination, Create 360 Survey, Create 360
// Report — the plain "Create Survey Template"/"Create Survey" steps in
// src/modules/surveys/actions.js are NOT ported here).
import { klaarApi } from '../shared/klaarCore.js'

// Ported verbatim from _uuid() in src/core/helpers.js.
export function _uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// Ported verbatim from unwrapPayload() in src/core/helpers.js — peels through both the
// klaarApi() response wrapper and feedback-nomination's own {success,message,data} envelope.
export function unwrapPayload(r) {
  let d = r.data?.data ?? r.data
  if (d && typeof d === 'object' && !Array.isArray(d) && 'data' in d && ('success' in d || 'message' in d)) {
    d = d.data
  }
  return d
}

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

function _tpl360(name, desc, questions) {
  return {
    name, long_description: desc,
    short_description: desc.slice(0, 80),
    audience_description: null, created_by: null,
    has_persona_customization: false, id: '',
    org_id: process.env.KLAAR_STOPGAP_WORKSPACE_ID,
    questions, status: 'PUBLISHED', type: '360',
  }
}

// Ported verbatim from _build360Templates() in actions.js.
export function build360Templates() {
  return [
    _tpl360('360° Strategic Horizon & Multi-Year Vision Audit',
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

    _tpl360('360° Incident Response & Crisis Composure Diagnostic',
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

    _tpl360('360° Matrix Leadership & Lateral Influence Evaluation',
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

    _tpl360('360° Governance, Risk Mitigation & Ethical Integrity Barometer',
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

    _tpl360('360° Fiscal Stewardship & Value Realization Diagnostic',
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

export async function postTemplate(payload) {
  return klaarApi('/surveyms/create_template', { method: 'POST', body: JSON.stringify(payload) })
}
