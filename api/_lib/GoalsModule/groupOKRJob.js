// Node-safe port of groupOKR() from src/modules/goals/actions.js ("Group OKR" in the
// widget UI), for the Slack slash-command proof-of-concept.
//
// The browser hard-requires state.workspaceGroupId here ("No group found — run Add Group
// in the Users module first") and pins every Group OKR to that one group. Instead, we
// fetch every group in the workspace via fetchAllGroups() and rotate through them (group i
// = groups[i % groups.length]) so the 10 Group OKRs spread across real, distinct groups
// rather than piling onto a single "best" one.
//
// keyResultGroupJob.js/addChildObjectiveGroupJob.js reuse this exact same rotation (by
// index, against the same fetchAllGroups() call) to put each KR/child objective on the
// same group as its parent OKR — cheaper and just as correct as looking up the parent's
// actual `groups` field, since the mapping is fully deterministic.
//
// GROUP_OKR_GOALS is exported for the same reason INDIVIDUAL_OKR_GOALS is in
// individualOKRJob.js — keyResultGroupJob.js/addChildObjectiveGroupJob.js need it to
// recover these objectives' real IDs live.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod, fetchAllGroups } from './goalsCore.js'

// The 10 group OKR names from GROUP_OKR_GOALS in src/modules/goals/actions.js:366-377.
export const GROUP_OKR_GOALS = [
  'Cascade Strategic Horizon Priorities Across Inter-Departmental Teams',
  'Harmonize Systems Integration Standards and Architectural Governance',
  'Establish Unified Service Level Commitments and Joint Escalation Paths',
  'Optimize Shared Resource Utilization and Cross-Functional Capital Allocation',
  'Foster Matrixed Accountability and Seamless Inter-Team Dependency Resolution',
  'Synchronize Multi-Departmental Milestone Planning and Feature Releases',
  'Scale Joint Proof-of-Concept Initiatives and Shared Testing Frameworks',
  'Institutionalize Cross-Team Post-Mortem Reviews and System Reliability Loops',
  'Federate Enterprise Knowledge Repositories and Technical Spec Registries',
  'Benchmark Collective Output Performance Against Key Business Impact Metrics',
];

// Ported from groupOKR() in actions.js, minus the state.js write at the end.
export async function groupOKRJob() {
  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const groups = await fetchAllGroups()
  if (!groups.length) return { ok: false, message: 'No groups found in this workspace — run /add-group first.' }

  const target = await resolveActivePeriod(sheetUserId)
  if (!target) return { ok: false, message: 'No time period found — run /create-time-period first.' }

  const year = new Date().getFullYear()
  const objStart = target.start_at || `${year}-01-01`
  const objEnd = target.end_at || `${year}-12-31`

  const created = []
  for (let i = 0; i < GROUP_OKR_GOALS.length; i++) {
    const name = GROUP_OKR_GOALS[i]
    const groupId = groups[i % groups.length].id
    const r = await klaarApi(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Group',
        time_period: target.id,
        groups: [groupId],
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        parent_node: null,
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
          name: 'Progress',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${GROUP_OKR_GOALS.length}; failed "${name}" (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }

  const periodLabel = target.name || `${objStart} → ${objEnd}`
  return { ok: true, message: `Created ${created.length} Group OKRs under "${periodLabel}". Go to Group Goals in Klaar to view them.` }
}

export async function runGroupOKRJob({ response_url }) {
  await runJobAndReply(groupOKRJob, response_url)
}
