// Node-safe port of addGroup() from src/modules/users/actions.js, for the Slack
// slash-command proof-of-concept. Shared Klaar logic lives in klaarStopgapCore.js.
//
// The browser reads state.dummyUsers (emails+UUIDs saved by addManagers()/addEmployees()
// earlier in the same session). We have no shared state, so UUIDs are re-derived live
// each run instead: fetch the workspace's employee list and match against the 10 known
// emails (5 MANAGERS + 5 EMPLOYEES) — same technique resolveCreatedUuid() already uses,
// just batched into one list fetch (mirrors bulkUploadGroup()'s own fallback fetch at
// src/modules/users/actions.js:847).
//
// Admin identity (email + org_user_id) for createGroup()'s adminEmail/adminOrgUserId
// params: rather than the real logged-in admin (which would need a JWT we never capture,
// and would need harvesting by hand per workspace — doesn't scale), we use whichever
// MANAGERS record is flagged is_admin: true. That person gets real is_admin: 'YES' rights
// in Klaar via putUserProfiles() in addManagersJob, so this needs no separate credential —
// just /create-manager having already run. Looked up by the is_admin flag, not a hardcoded
// name, since manager names get swapped between test rounds.
import { getStopgapDomain, createGroup, fetchAllEmployees, resolveAdminIdentity, runJobAndReply } from './klaarStopgapCore.js'
import { MANAGERS } from './addManagersJob.js'
import { EMPLOYEES } from './addEmployeesJob.js'

// The 7 group names from GROUP_NAMES in src/modules/users/actions.js:894-902.
const GROUP_NAMES = [
  'Quantum Error Correction, Topological Qubits & Cryogenic Control',
  'Neuromorphic Computing, Bio-Sensing & Brain-Computer Interfaces',
  'Decentralized Identity, Zero-Knowledge Proofs & Verifiable Credentials',
  'Hyperscale FinOps, Cloud Economics & Dynamic Workload Placement',
  'Autonomous Grid Resilience, Distributed Energy & Micro-Generation',
  'Synthetic Media Provenance, Deepfake Mitigation & Content Watermarking',
  'Robotic Process Perception, Spatial Kinematics & Digital Twins',
];

// Fetch the workspace's employees and keep only the ones matching our 10 known
// manager/employee emails — no durable store needed, just re-fetch and filter live.
async function resolveKnownMembers(domain) {
  const knownEmails = new Set(
    [...MANAGERS, ...EMPLOYEES].map(u => `${u.email_prefix}@${domain}`.toLowerCase())
  )
  const all = await fetchAllEmployees()
  return all.filter(m => knownEmails.has(m.email.toLowerCase()))
}

// Ported from addGroup() in actions.js, minus the state.js read/write.
export async function addGroupJob() {
  const { domain, error } = getStopgapDomain()
  if (error) return error

  const members = await resolveKnownMembers(domain)
  if (!members.length) {
    return { ok: false, message: 'No known managers/employees found in this workspace yet. Run /create-manager and /add-employee first.' }
  }

  const admin = resolveAdminIdentity(MANAGERS, domain, members)
  if (admin.error) return { ok: false, message: admin.error }
  const { adminEmail, adminOrgUserId } = admin

  const created = [], failed = []

  for (let i = 0; i < GROUP_NAMES.length; i++) {
    const name = GROUP_NAMES[i]

    // Rotate: group i gets 4 members starting at index i (wraps around)
    const groupSize = Math.min(4, members.length)
    const groupMembers = []
    for (let j = 0; j < groupSize; j++) {
      groupMembers.push(members[(i + j) % members.length])
    }

    const result = await createGroup(name, groupMembers, adminEmail, adminOrgUserId)
    if (result.ok) {
      created.push({ name, existing: result.existing })
    } else {
      failed.push(`${name} (${result.status})`)
    }
  }

  if (failed.length) return { ok: false, message: `Created ${created.length}/${GROUP_NAMES.length}, failed: ${failed.join(', ')}` }
  return { ok: true, message: `Created ${created.length} groups: ${created.map(g => g.name).join(', ')}` }
}

export async function runAddGroupJob({ response_url }) {
  await runJobAndReply(addGroupJob, response_url)
}
