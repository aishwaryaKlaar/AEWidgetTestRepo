// Node-safe port of addChildObjectiveGroup() from src/modules/goals/actions.js ("Add
// Child Objective" under Group OKR in the widget UI), for the Slack slash-command
// proof-of-concept. Mirrors addChildObjectiveJob.js exactly, just against
// GROUP_OKR_GOALS/category Group, and with the groups: [...] field — same rotation across
// every group in the workspace (group i = groups[i % groups.length]) as groupOKRJob.js.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod, resolveObjectiveIds, fetchAllGroups } from './goalsCore.js'
import { GROUP_OKR_GOALS } from './groupOKRJob.js'

// The 20 names from GROUPCHILD_OBJECTIVE_NAMES in src/modules/goals/actions.js:761-782.
const GROUPCHILD_OBJECTIVE_NAMES = [
  'Align business unit roadmaps around unified enterprise performance metrics',
  'Deploy real-time visibility dashboards for co-owned cross-departmental OKRs',
  'Synchronize delivery schedules and handoffs across joint-project teams',
  'Harmonize operational standards and protocols across collaborating departments',
  'Assign clear single-threaded leaders for every cross-functional initiative',
  'Eliminate process variations between inter-departmental workflows',
  'Establish structured governance forums to streamline cross-team decision-making',
  'Build a centralized knowledge repository for cross-departmental documentation',
  'Launch joint skill-building workshops to bridge domain knowledge gaps',
  'Monitor quarterly milestone trajectories across all co-owned group goals',
  'Unblock cross-team dependency chains through weekly escalation reviews',
  'Establish dedicated communication channels between interdependent business units',
  'Track operational throughput metrics across shared departmental initiatives',
  'Standardize collaboration software and tooling across participating teams',
  'Conduct bi-weekly progress syncs to validate alignment on shared outcomes',
  'Identify and mitigate cross-functional dependency risks before sprint locks',
  'Optimize joint resource allocation to balance cross-team workload capacity',
  'Highlight and scale successful cross-departmental execution frameworks',
  'Execute actionable retrospective plans after completing multi-team launches',
  'Validate that group-level project deliverables directly feed overarching company targets',
];

// Ported from addChildObjectiveGroup() in actions.js, minus the state.js read.
export async function addChildObjectiveGroupJob() {
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
    const name = GROUPCHILD_OBJECTIVE_NAMES[i] || `Group Child Objective ${i + 1}`
    const groupId = groups.length ? groups[i % groups.length].id : null
    const r = await klaarApi(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
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
          name: 'Progress',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed group child objective ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Group Child Objectives. Go to Group Goals in Klaar to view them.` }
}

export async function runAddChildObjectiveGroupJob({ response_url }) {
  await runJobAndReply(addChildObjectiveGroupJob, response_url)
}
