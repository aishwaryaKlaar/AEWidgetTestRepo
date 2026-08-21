// Node-safe port of keyResult() from src/modules/goals/actions.js ("Key Result" under
// Individual OKR in the widget UI), for the Slack slash-command proof-of-concept.
//
// The browser reads state.individualOKRIds (the objective IDs individualOKR() stashed
// earlier in the same session) as parent_node for each KR. We have no shared state, so
// resolveObjectiveIds() in goalsCore.js re-derives them live instead, against the real
// /okr/performance/all_objectives/ list endpoint (confirmed via Klaar's own "My Goals"
// network traffic — the /okr/performance/objective/ path the browser widget only ever
// POSTs to does not support listing at all, 500s unconditionally).
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod, resolveObjectiveIds } from './goalsCore.js'
import { INDIVIDUAL_OKR_GOALS } from './individualOKRJob.js'

// The 20 KR names from KR_NAMES in src/modules/goals/actions.js:524-546.
const KR_NAMES = [
  'Achieve 98% on-time completion for all assigned project milestones across the review period',
  'Autonomously resolve at least 8 high-complexity technical or operational edge cases',
  'Maintain a 95%+ first-pass quality rate on core deliverables, requiring minimal revisions',
  'Secure a minimum 4.5/5 stakeholder satisfaction rating across key collaborative initiatives',
  'Maintain 99% data precision and compliance accuracy in all documentation and reports',
  'Drive 5 high-impact, business-critical deliverables from initiation through successful launch',
  'Maintain 100% SLA adherence on core priorities during unexpected shifts in business demand',
  'Formulate and execute 6 proactive risk mitigation plans for identified operational bottlenecks',
  'Earn 2 advanced domain certifications and successfully implement learnings into team workflows',
  'Achieve or exceed 100% of target metrics defined in individual performance scorecards',
  'Reduce personal task rollover and overdue action items by 30% through improved planning',
  'Facilitate 4 technical coaching or domain best-practice sessions to upskill team members',
  'Exceed target output capacity for 6 consecutive monthly performance cycles',
  'Engineer root-cause fixes for 5 persistent operational roadblocks within your functional area',
  'Resolve 95% of assigned high-priority service requests within established SLA thresholds',
  'Maintain schedule variance under 5% for all committed sprint and quarterly deliverables',
  'Propose 5 continuous process improvements, successfully launching at least 2 into production',
  'Achieve a 100% zero-missed-deadline record across all critical client and internal commitments',
  'Partner with 5 cross-functional leads to successfully deliver co-owned strategic initiatives',
  'Incorporate 3 newly mastered tools or methodologies to measurably increase project velocity',
];

// Ported from keyResult() in actions.js, minus the state.js read/write.
export async function keyResultJob() {
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
    const name = KR_NAMES[i] || `Key Result ${i + 1}`
    const r = await klaarApi(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'KR',
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
          name: '',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed KR ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Key Results. Go to My Goals in Klaar to view them.` }
}

export async function runKeyResultJob({ response_url }) {
  await runJobAndReply(keyResultJob, response_url)
}
