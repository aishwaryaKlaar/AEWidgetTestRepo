// Node-safe port of addChildObjective() from src/modules/goals/actions.js ("Add Child
// Objective" under Individual OKR in the widget UI), for the Slack slash-command
// proof-of-concept.
//
// Note the source code's own comment says "child of each Individual Key Result", but the
// actual implementation parents each child objective to state.individualOKRIds — the
// Individual OKRs themselves, not the KRs. Ported to match the real code, not the stale
// comment. Parent IDs re-derived the same way as keyResultJob.js — see that file and
// goalsCore.js's resolveObjectiveIds() comment for the one unverified assumption here.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod, resolveObjectiveIds } from './goalsCore.js'
import { INDIVIDUAL_OKR_GOALS } from './individualOKRJob.js'

// The 20 names from CHILD_OBJECTIVE_NAMES in src/modules/goals/actions.js:681-702.
const CHILD_OBJECTIVE_NAMES = [
  'Define clear KPIs and success metrics for all primary daily tasks',
  'Utilize root-cause analysis frameworks to tackle operational friction',
  'Enforce rigorous QA and code/document review standards on all outputs',
  'Establish proactive status update cadences with key internal stakeholders',
  'Conduct post-project audits to identify error patterns and optimize accuracy',
  'Partner actively across departments to align multi-team deliverables',
  'Dynamically adjust sprint backlogs to support shifting enterprise goals',
  'Document operational edge cases early to prevent deployment bottlenecks',
  'Complete specialized skill modules and integrate techniques into live sprints',
  'Monitor personal productivity metrics weekly to ensure continuous SLA compliance',
  'Map individual task outputs directly to high-level departmental OKRs',
  'Apply Eisenhower matrix prioritization to maximize high-leverage focus time',
  'Maintain complete lifecycle ownership of high-priority operational features',
  'Drive solution architecture during joint technical and business reviews',
  'Synthesize operational dataset trends to formulate actionable process recommendations',
  'Streamline individual toolchains to maximize throughput and eliminate redundant steps',
  'Deliver structured, data-backed briefings to internal leadership and peers',
  'Launch targeted process refinements within core daily workflow routines',
  'Incorporate empirical performance logs to guide task estimation and execution',
  'Maintain end-to-end follow-through on all assigned team action items',
];

// Ported from addChildObjective() in actions.js, minus the state.js read.
export async function addChildObjectiveJob() {
  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const target = await resolveActivePeriod(sheetUserId)
  if (!target) return { ok: false, message: 'No time period found — run /create-time-period first.' }

  const parentIds = (await resolveObjectiveIds(INDIVIDUAL_OKR_GOALS, sheetUserId, target.id)).filter(Boolean)
  if (!parentIds.length) return { ok: false, message: 'No Individual OKRs found — run /individual-okr first.' }

  const year = new Date().getFullYear()
  const objStart = target.start_at || `${year}-01-01`
  const objEnd = target.end_at || `${year}-12-31`

  const created = []
  for (let i = 0; i < parentIds.length; i++) {
    const name = CHILD_OBJECTIVE_NAMES[i] || `Child Objective ${i + 1}`
    const r = await klaarApi(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Individual',
        parent_node: parentIds[i],
        time_period: target.id,
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        description: null,
        groups: [],
        contributors: [],
        tags: [],
        milestones: [],
        milestone_type: '',
        automatic_tracking_enabled: false,
        start_at: objStart,
        end_at: objEnd,
        metric_data: {
          type: 'PERCENTAGE',
          target_type: 'Increase',
          dimension_type: 'RANGE',
          name: 'Progress',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed child objective ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Individual Child Objectives. Go to My Goals in Klaar to view them.` }
}

export async function runAddChildObjectiveJob({ response_url }) {
  await runJobAndReply(addChildObjectiveJob, response_url)
}
