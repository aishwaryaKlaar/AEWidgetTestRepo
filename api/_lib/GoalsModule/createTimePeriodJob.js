// Node-safe port of createTimePeriod() from src/modules/goals/actions.js, for the Slack
// slash-command proof-of-concept. Generic Klaar auth/fetch helpers come from
// api/_lib/shared/klaarCore.js — this is the first GoalsModule job, a sibling to
// UserModule rather than nested inside it.
//
// Admin identity (the "sheet_user_id" whose org_user.id owns the time period sheet) is
// resolved via resolveSheetUserId() in goalsCore.js — shared by every Goals job, since
// they all need the same real, resolvable person (see that file's comment for why a real
// logged-in admin's JWT doesn't scale per-workspace).
//
// Group association is optional per the original code's own comment ("not a hard
// requirement") — ported anyway for fidelity, resolved live via fetchWorkspaceGroupId()
// in goalsCore.js instead of state.workspaceGroupId (see that function's comment for why).
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, fetchWorkspaceGroupId } from './goalsCore.js'

// The 7 time periods from createTimePeriod() in src/modules/goals/actions.js:20-28.
function buildPeriods() {
  const year = new Date().getFullYear()
  return [
    { name: `Vision Setting & Strategic Architecture ${year}`, start_at: `${year}-01-01`, end_at: `${year}-02-28` },
    { name: `Capacity Planning & Foundation Enablement ${year}`, start_at: `${year}-03-01`, end_at: `${year}-04-30` },
    { name: `Core Velocity & Milestone Acceleration ${year}`, start_at: `${year}-05-01`, end_at: `${year}-06-30` },
    { name: `Platform Hardening & Enterprise Scaling ${year}`, start_at: `${year}-07-01`, end_at: `${year}-08-31` },
    { name: `Go-To-Market Delivery & Commercial Impact ${year}`, start_at: `${year}-09-01`, end_at: `${year}-10-31` },
    { name: `Performance Governance & Compliance Assurance ${year}`, start_at: `${year}-11-01`, end_at: `${year}-11-30` },
    { name: `Annual Synthesis & Executive Succession Review ${year}`, start_at: `${year}-12-01`, end_at: `${year}-12-31` },
  ];
}

// Ported from createTimePeriod() in actions.js, minus the state.js write at the end.
// Future Goals steps that need "which time period to use" can re-derive it live via
// GET /okr/performance/time_period/ instead of a durable store — same pattern used
// throughout this project (manager/employee UUIDs, admin identity, group membership).
export async function createTimePeriodJob() {
  const { sheetUserId: adminId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const groupId = await fetchWorkspaceGroupId()

  const periods = buildPeriods()
  const created = []

  for (const tp of periods) {
    const body = groupId ? { ...tp, groups: [groupId] } : { ...tp }
    const r = await klaarApi(`/okr/performance/time_period/?sheet_user_id=${adminId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${periods.length}; failed "${tp.name}" (${r.status})` }
    created.push(r.data?.data?.name || tp.name)
    await new Promise(res => setTimeout(res, 200))
  }

  return { ok: true, message: `Created ${created.length} time periods: ${created.join(', ')}. Go to Goal Cycles in Klaar to view them.` }
}

export async function runCreateTimePeriodJob({ response_url }) {
  await runJobAndReply(createTimePeriodJob, response_url)
}
