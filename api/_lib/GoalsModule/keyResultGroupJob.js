// Node-safe port of keyResultGroup() from src/modules/goals/actions.js ("Key Result"
// under Group OKR in the widget UI), for the Slack slash-command proof-of-concept.
// Mirrors keyResultJob.js exactly, just against GROUP_OKR_GOALS/category Group, and with
// the groups: [...] field groupOKR()'s own creation call also sets — same rotation across
// every group in the workspace (group i = groups[i % groups.length]), not one fixed group.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod, resolveObjectiveIds, fetchAllGroups } from './goalsCore.js'
import { GROUP_OKR_GOALS } from './groupOKRJob.js'

// The 10 group KR names from KR_GROUP_NAMES in src/modules/goals/actions.js:610-621.
const KR_GROUP_NAMES = [
  'Conduct monthly cross-functional alignment reviews with 100% participation from all partner team leads',
  'Publish real-time group progress dashboards covering 100% of active joint objectives and key milestones',
  'Successfully deliver at least 4 cross-departmental initiatives that achieve 100% of target business metrics',
  'Reduce average cycle time for multi-team operational bottlenecks by 25% through capacity planning',
  'Achieve 95% on-time milestone delivery across all shared group commitments during the review period',
  'Standardize 5 inter-departmental workflows and achieve full adoption across participating teams',
  'Facilitate 6 joint decision-making forums resulting in documented and executed strategic roadmaps',
  'Organize 4 cross-team domain expertise sessions with 90%+ attendance to accelerate knowledge scaling',
  'Increase the group cross-functional synergy rating by 15% in the internal collaboration survey',
  'Achieve 90% completion rate on all high-impact OKR key results co-owned across business units',
];

// Ported from keyResultGroup() in actions.js, minus the state.js read.
export async function keyResultGroupJob() {
  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const target = await resolveActivePeriod(sheetUserId)
  if (!target) return { ok: false, message: 'No time period found — run /create-time-period first.' }

  const parentIds = (await resolveObjectiveIds(GROUP_OKR_GOALS, sheetUserId, target.id)).filter(Boolean)
  if (!parentIds.length) return { ok: false, message: 'No Group OKRs found — run /group-okr first.' }

  const year = new Date().getFullYear()
  const objStart = target.start_at || `${year}-01-01`
  const objEnd = target.end_at || `${year}-12-31`

  const groups = await fetchAllGroups()

  const created = []
  for (let i = 0; i < parentIds.length; i++) {
    const name = KR_GROUP_NAMES[i] || `Group Key Result ${i + 1}`
    const groupId = groups.length ? groups[i % groups.length].id : null
    const r = await klaarApi(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'KR',
        category: 'Group',
        parent_node: parentIds[i],
        time_period: target.id,
        groups: groupId ? [groupId] : [],
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        description: null,
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
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed Group KR ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Group Key Results. Go to Group Goals in Klaar to view them.` }
}

export async function runKeyResultGroupJob({ response_url }) {
  await runJobAndReply(keyResultGroupJob, response_url)
}
